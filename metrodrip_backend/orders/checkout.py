import hashlib
import json
import re
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from catalog.models import (
    CatalogProductVariant,
    InventoryReservation,
    InventoryStockEntry,
    InventoryStockMovement,
)
from fulfillment.models import ShippingShippingZone

from .models import (
    OrdersOrder,
    OrdersOrderLine,
    OrdersPayment,
    OrdersPaymentTransition,
    OrdersShippingAddress,
)

def record_payment_transition(
    payment,
    to_status,
    from_status=None,
    actor_type='system',
    actor_id=None,
    provider_event_id=None,
    reason=None,
    metadata=None,
):
    current_from = from_status if from_status is not None else payment.status
    now = timezone.now()
    return OrdersPaymentTransition.objects.create(
        payment=payment,
        order=payment.order,
        from_status=current_from,
        to_status=to_status,
        actor_type=actor_type,
        actor_id=str(actor_id) if actor_id is not None else None,
        provider_event_id=str(provider_event_id) if provider_event_id is not None else None,
        reason=reason or '',
        metadata=metadata or {},
        created_at=now,
    )

from .paymongo import PayMongoClient, PayMongoError, pesos_to_centavos, verified_paid_payment


ONLINE_METHODS = {'gcash', 'maya', 'card'}
PAYMENT_METHOD_ALIASES = {
    'cash_on_delivery': 'cod',
    'cod': 'cod',
    'gcash': 'gcash',
    'maya': 'maya',
    'paymaya': 'maya',
    'card': 'card',
    'cards': 'card',
}
ZONE_ALIASES = {
    'metro manila (ncr)': 'NCR (Metro Manila)',
    'ncr (metro manila)': 'NCR (Metro Manila)',
    'luzon': 'North & South Luzon',
    'north & south luzon': 'North & South Luzon',
    'visayas': 'Visayas & Mindanao (VisMin)',
    'mindanao': 'Visayas & Mindanao (VisMin)',
    'visayas & mindanao (vismin)': 'Visayas & Mindanao (VisMin)',
}
SENSITIVE_PAYMENT_FIELD_TOKENS = {
    'accountnumber',
    'cardcvc',
    'cardcvv',
    'cardexpiry',
    'cardexpiration',
    'cardnumber',
    'cvc',
    'cvv',
    'expiration',
    'expiry',
    'otp',
    'pan',
    'securitycode',
    'walletpassword',
    'walletpin',
}
CHECKOUT_FIELDS = {
    'delivery_zone',
    'discount',
    'idempotency_key',
    'items',
    'lines',
    'payment_method',
    'shipping',
    'shipping_address',
    'status',
    'subtotal',
    'tax',
    'total',
}
ITEM_FIELDS = {'quantity', 'variant', 'variantId', 'variant_id'}
ADDRESS_FIELDS = {
    'address_line1',
    'address_line2',
    'city',
    'country',
    'name',
    'phone',
    'postal_code',
    'state',
}


class CheckoutError(Exception):
    def __init__(self, message, status_code=400, code='checkout_invalid'):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def _contains_sensitive_payment_data(value):
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = re.sub(r'[^a-z0-9]', '', str(key).strip().lower())
            if normalized in SENSITIVE_PAYMENT_FIELD_TOKENS or _contains_sensitive_payment_data(item):
                return True
    if isinstance(value, list):
        return any(_contains_sensitive_payment_data(item) for item in value)
    return False


def _clean_text(value, field, max_length, required=True):
    if not isinstance(value, str):
        if required:
            raise CheckoutError(f'{field} is required.', code='invalid_address')
        return ''
    cleaned = value.strip()
    if required and not cleaned:
        raise CheckoutError(f'{field} is required.', code='invalid_address')
    if len(cleaned) > max_length:
        raise CheckoutError(f'{field} is too long.', code='invalid_address')
    return cleaned


def validate_checkout_payload(payload):
    if not isinstance(payload, dict):
        raise CheckoutError('Checkout must be a JSON object.')
    if _contains_sensitive_payment_data(payload):
        raise CheckoutError(
            'Payment credentials must only be entered on PayMongo secure checkout.',
            code='raw_payment_credentials_rejected',
        )
    if set(payload) - CHECKOUT_FIELDS:
        raise CheckoutError('Checkout contains unsupported fields.', code='unexpected_checkout_field')
    if 'items' in payload and 'lines' in payload:
        raise CheckoutError('Send either items or lines, not both.', code='invalid_item')

    raw_method = payload.get('payment_method', 'cod')
    method = PAYMENT_METHOD_ALIASES.get(raw_method.strip().lower()) if isinstance(raw_method, str) else None
    if not method:
        raise CheckoutError('Select a supported payment method.', code='payment_method_unavailable')

    key = payload.get('idempotency_key')
    if not isinstance(key, str) or not 8 <= len(key) <= 128 or not re.fullmatch(r'[A-Za-z0-9._:-]+', key):
        raise CheckoutError(
            'A valid idempotency key is required.',
            code='invalid_idempotency_key',
        )

    raw_items = payload.get('items') or payload.get('lines')
    if not isinstance(raw_items, list) or not raw_items:
        raise CheckoutError('Order items are required.', code='empty_cart')
    if len(raw_items) > getattr(settings, 'CHECKOUT_MAX_DISTINCT_ITEMS', 25):
        raise CheckoutError('This checkout contains too many distinct items.', code='cart_limit_exceeded')
    aggregated = {}
    for item in raw_items:
        if not isinstance(item, dict):
            raise CheckoutError('Each order item must be an object.', code='invalid_item')
        if set(item) - ITEM_FIELDS:
            raise CheckoutError('A cart item contains unsupported fields.', code='invalid_item')
        variant_id = item.get('variant_id', item.get('variant', item.get('variantId')))
        quantity = item.get('quantity')
        if type(variant_id) is not int or variant_id <= 0 or type(quantity) is not int or quantity <= 0:
            raise CheckoutError(
                'Variant IDs and quantities must be positive integers.',
                code='invalid_item',
            )
        aggregated[variant_id] = aggregated.get(variant_id, 0) + quantity
        if aggregated[variant_id] > getattr(settings, 'CHECKOUT_MAX_QUANTITY_PER_VARIANT', 5):
            raise CheckoutError(
                'The quantity limit for one product variant was exceeded.',
                code='item_quantity_limit',
            )

    raw_address = payload.get('shipping_address')
    if not isinstance(raw_address, dict):
        raise CheckoutError('Shipping address is required.', code='invalid_address')
    if set(raw_address) - ADDRESS_FIELDS:
        raise CheckoutError('Shipping address contains unsupported fields.', code='invalid_address')
    address = {
        'name': _clean_text(raw_address.get('name'), 'Recipient name', 150),
        'address_line1': _clean_text(raw_address.get('address_line1'), 'Address', 255),
        'address_line2': _clean_text(raw_address.get('address_line2', ''), 'Address line 2', 255, False),
        'city': _clean_text(raw_address.get('city'), 'City', 100),
        'state': _clean_text(raw_address.get('state'), 'State or delivery zone', 100),
        'postal_code': _clean_text(raw_address.get('postal_code', ''), 'Postal code', 20, False),
        'country': _clean_text(raw_address.get('country', 'PH'), 'Country', 2).upper(),
        'phone': _clean_text(raw_address.get('phone'), 'Mobile number', 32),
    }
    if address['country'] != 'PH':
        raise CheckoutError('MetroDrip currently ships only within the Philippines.', code='unsupported_country')

    raw_zone = payload.get('delivery_zone')
    if not isinstance(raw_zone, str) or not raw_zone.strip():
        raise CheckoutError('Delivery zone is required.', code='invalid_delivery_zone')
    canonical_zone = ZONE_ALIASES.get(raw_zone.strip().lower(), raw_zone.strip())

    normalized = {
        'items': [
            {'variant_id': variant_id, 'quantity': aggregated[variant_id]}
            for variant_id in sorted(aggregated)
        ],
        'payment_method': method,
        'idempotency_key': key,
        'delivery_zone': canonical_zone,
        'shipping_address': address,
    }
    fingerprint_source = {key: value for key, value in normalized.items() if key != 'idempotency_key'}
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_source, sort_keys=True, separators=(',', ':')).encode('utf-8')
    ).hexdigest()
    return normalized, fingerprint


def _payment_line_items(order):
    items = [
        {
            'amount': pesos_to_centavos(line.unit_price),
            'currency': 'PHP',
            'description': line.variant.sku if line.variant else line.product.sku,
            'name': line.product.name[:200],
            'quantity': line.quantity,
        }
        for line in order.lines.select_related('product', 'variant').all()
    ]
    if order.shipping:
        items.append({
            'amount': pesos_to_centavos(order.shipping),
            'currency': 'PHP',
            'description': 'MetroDrip delivery',
            'name': 'Shipping',
            'quantity': 1,
        })
    return items


def _release_reservations(order, final_status='released'):
    now = timezone.now()
    with transaction.atomic():
        reservations = list(
            InventoryReservation.objects.select_for_update().filter(
                order_id=order.id,
                status='active',
            )
        )
        for reservation in reservations:
            stock = InventoryStockEntry.objects.select_for_update().filter(
                product=reservation.product,
                variant=reservation.variant,
                warehouse_id=reservation.warehouse_id,
            ).first()
            if stock:
                stock.reserved_quantity = max(0, stock.reserved_quantity - reservation.quantity)
                stock.updated_at = now
                stock.save(update_fields=['reserved_quantity', 'updated_at'])
            reservation.status = final_status
            reservation.released_at = now
            reservation.save(update_fields=['status', 'released_at'])


def _commit_reservations(order):
    """Convert active holds into stock movements exactly once."""
    now = timezone.now()
    with transaction.atomic():
        reservations = list(
            InventoryReservation.objects.select_for_update().select_related('variant').filter(
                order_id=order.id,
            ).order_by('id')
        )
        if not reservations:
            return False

        # A prior successful call is idempotent, but released or expired holds
        # must never be mistaken for stock that can still be fulfilled.
        if all(reservation.status == 'committed' for reservation in reservations):
            return True
        if any(reservation.status != 'active' for reservation in reservations):
            return False

        locked_rows = []
        for reservation in reservations:
            stock = InventoryStockEntry.objects.select_for_update().filter(
                product=reservation.product,
                variant=reservation.variant,
                warehouse_id=reservation.warehouse_id,
            ).first()
            if (
                not stock
                or stock.quantity < reservation.quantity
                or stock.reserved_quantity < reservation.quantity
            ):
                return False
            locked_rows.append((reservation, stock))

        for reservation, stock in locked_rows:
            stock.quantity -= reservation.quantity
            stock.reserved_quantity -= reservation.quantity
            stock.updated_at = now
            stock.save(update_fields=['quantity', 'reserved_quantity', 'updated_at'])
            InventoryStockMovement.objects.create(
                variant=reservation.variant,
                sku=reservation.variant.sku if reservation.variant else None,
                delta=-reservation.quantity,
                reason='sale',
                ref_order_ref=order.id,
            )
            reservation.status = 'committed'
            reservation.committed_at = now
            reservation.save(update_fields=['status', 'committed_at'])
    return True


def _expire_order(order, provider_client=None):
    payment = order.payments.order_by('-created_at').first()
    if not payment or payment.status == 'paid' or order.status in {'cancelled', 'payment_expired'}:
        return order
    now = timezone.now()
    provider_ref = None
    with transaction.atomic():
        locked_payment = OrdersPayment.objects.select_for_update().select_related('order').get(pk=payment.pk)
        locked_order = OrdersOrder.objects.select_for_update().get(pk=locked_payment.order_id)
        if locked_payment.status == 'paid':
            return locked_order
        if locked_order.status in {'cancelled', 'payment_expired'}:
            return locked_order
        _release_reservations(locked_order, final_status='expired')
        from_status = locked_payment.status
        locked_payment.status = 'expired'
        locked_payment.failure_code = None
        locked_payment.updated_at = now
        locked_payment.save(update_fields=['status', 'failure_code', 'updated_at'])
        record_payment_transition(
            locked_payment,
            to_status='expired',
            from_status=from_status,
            actor_type='system_expiry',
            reason='Hold reservation expired (30m TTL)',
        )
        locked_order.status = 'payment_expired'
        locked_order.cancelled_at = now
        locked_order.updated_at = now
        locked_order.save(update_fields=['status', 'cancelled_at', 'updated_at'])
        provider_ref = locked_payment.provider_ref

    # The local reservation deadline is authoritative for inventory. Provider
    # expiration is best effort; a late paid webhook is routed to payment_review
    # because the expired reservations can no longer be committed.
    if provider_ref:
        try:
            (provider_client or PayMongoClient()).expire_checkout_session(provider_ref)
        except PayMongoError:
            with transaction.atomic():
                current_payment = OrdersPayment.objects.select_for_update().get(pk=payment.pk)
                if current_payment.status == 'expired':
                    current_payment.failure_code = 'provider_expiry_unconfirmed'
                    current_payment.updated_at = timezone.now()
                    current_payment.save(update_fields=['failure_code', 'updated_at'])
    return locked_order


def expire_one_stale_checkout(provider_client=None):
    stale = OrdersOrder.objects.filter(
        status__in=['pending_payment', 'payment_setup_failed'],
        reservation_expires_at__lte=timezone.now(),
    ).order_by('reservation_expires_at').first()
    if not stale:
        return False
    try:
        _expire_order(stale, provider_client=provider_client)
    except PayMongoError:
        return False
    return True


def expire_stale_checkouts(limit=25, provider_client=None):
    """Expire a bounded batch for free-tier-safe operator maintenance."""
    bounded_limit = max(1, min(int(limit), 500))
    expired = 0
    for _ in range(bounded_limit):
        if not expire_one_stale_checkout(provider_client=provider_client):
            break
        expired += 1
    return expired


def _build_order(customer, checkout, fingerprint):
    now = timezone.now()
    reservation_expires_at = now + timedelta(minutes=30) if checkout['payment_method'] in ONLINE_METHODS else None
    # Serialize checkout creation per account so parallel requests cannot evade
    # duplicate-attempt, active-attempt, or reservation-quantity limits.
    customer.__class__.objects.select_for_update().get(pk=customer.pk)
    if checkout['payment_method'] in ONLINE_METHODS:
        active_orders = OrdersOrder.objects.filter(
            customer_id=customer.id,
            status__in=['pending_payment', 'payment_setup_failed'],
            reservation_expires_at__gt=now,
            cancelled_at__isnull=True,
        ).order_by('-created_at')
        matching_order = active_orders.filter(checkout_fingerprint=fingerprint).first()
        if matching_order:
            matching_payment = matching_order.payments.order_by('-created_at').first()
            if not matching_payment:
                raise CheckoutError(
                    'The existing checkout has no payment record.',
                    status_code=409,
                    code='payment_missing',
                )
            return matching_order, matching_payment, True

        max_attempts = getattr(settings, 'CHECKOUT_MAX_ACTIVE_ONLINE_ATTEMPTS', 3)
        active_order_ids = list(active_orders.values_list('id', flat=True))
        if len(active_order_ids) >= max_attempts:
            raise CheckoutError(
                'Complete or cancel an existing online checkout before starting another.',
                status_code=429,
                code='active_checkout_limit',
            )

        max_quantity = getattr(settings, 'CHECKOUT_MAX_QUANTITY_PER_VARIANT', 5)
        for item in checkout['items']:
            already_reserved = (
                InventoryReservation.objects.filter(
                    order_id__in=active_order_ids,
                    variant_id=item['variant_id'],
                    status='active',
                ).aggregate(total=Sum('quantity'))['total']
                or 0
            )
            if already_reserved + item['quantity'] > max_quantity:
                raise CheckoutError(
                    'Complete or cancel the existing checkout for this product before reserving more.',
                    status_code=409,
                    code='active_reservation_limit',
                )

    zone = ShippingShippingZone.objects.select_for_update().filter(
        name__iexact=checkout['delivery_zone'],
        is_active=True,
    ).first()
    if not zone:
        raise CheckoutError('The selected delivery zone is unavailable.', code='delivery_zone_unavailable')

    priced_items = []
    subtotal = Decimal('0.00')
    for item in checkout['items']:
        variant = CatalogProductVariant.objects.select_for_update().select_related('product').filter(
            id=item['variant_id'],
            is_active=True,
            product__is_active=True,
        ).first()
        if not variant:
            raise CheckoutError('A cart item is no longer available.', status_code=409, code='catalog_conflict')
        if variant.product.currency.upper() != 'PHP':
            raise CheckoutError('A cart item has an unsupported currency.', status_code=409, code='currency_conflict')
        unit_price = (variant.product.base_price + variant.price_adjustment).quantize(Decimal('0.01'))
        line_total = unit_price * item['quantity']
        subtotal += line_total
        priced_items.append((variant, item['quantity'], unit_price, line_total))

    order = OrdersOrder.objects.create(
        customer_id=customer.id,
        status='placed' if checkout['payment_method'] == 'cod' else 'pending_payment',
        subtotal=subtotal,
        tax=Decimal('0.00'),
        shipping=Decimal(zone.fee),
        discount=Decimal('0.00'),
        total=subtotal + Decimal(zone.fee),
        currency='PHP',
        checkout_idempotency_key=checkout['idempotency_key'],
        checkout_fingerprint=fingerprint,
        reservation_expires_at=reservation_expires_at,
        created_at=now,
        updated_at=now,
    )
    OrdersShippingAddress.objects.create(
        order=order,
        created_at=now,
        updated_at=now,
        **checkout['shipping_address'],
    )

    for variant, quantity, unit_price, line_total in priced_items:
        stock = InventoryStockEntry.objects.select_for_update().filter(
            product=variant.product,
            variant=variant,
        ).order_by('warehouse_id', 'id').first()
        if not stock or stock.quantity - stock.reserved_quantity < quantity:
            raise CheckoutError(
                f'{variant.product.name} no longer has enough stock.',
                status_code=409,
                code='insufficient_stock',
            )
        stock.reserved_quantity += quantity
        stock.updated_at = now
        stock.save(update_fields=['reserved_quantity', 'updated_at'])
        InventoryReservation.objects.create(
            order_id=order.id,
            product=variant.product,
            variant=variant,
            quantity=quantity,
            warehouse_id=stock.warehouse_id,
            status='active',
            expires_at=reservation_expires_at or (now + timedelta(days=30)),
            created_at=now,
        )
        variant_desc = ' · '.join(
            str(val).upper()
            for val in (variant.attributes.values() if isinstance(variant.attributes, dict) else [])
            if val
        )
        OrdersOrderLine.objects.create(
            order=order,
            product=variant.product,
            variant=variant,
            quantity=quantity,
            unit_price=unit_price,
            total_price=line_total,
            discount_amount=Decimal('0.00'),
            tax_amount=Decimal('0.00'),
            tax_rate=Decimal('0.0000'),
            product_name_snapshot=variant.product.name[:255],
            sku_snapshot=(variant.sku or variant.product.sku)[:100],
            variant_desc_snapshot=variant_desc[:255],
            created_at=now,
            updated_at=now,
        )

    payment = OrdersPayment.objects.create(
        order=order,
        method=checkout['payment_method'],
        status='pending_collection' if checkout['payment_method'] == 'cod' else 'awaiting_payment',
        amount=order.total,
        currency='PHP',
        provider='cod' if checkout['payment_method'] == 'cod' else 'paymongo',
        metadata={'delivery_zone': zone.name},
        created_at=now,
        updated_at=now,
    )
    record_payment_transition(
        payment,
        to_status=payment.status,
        from_status='none',
        actor_type='customer',
        actor_id=customer.id,
        reason='Order checkout initiated',
        metadata={'payment_method': payment.method, 'delivery_zone': zone.name},
    )
    if checkout['payment_method'] == 'cod' and not _commit_reservations(order):
        raise CheckoutError(
            'Stock changed while the order was being placed. Please retry.',
            status_code=409,
            code='inventory_commit_conflict',
        )
    return order, payment, False


def _ensure_provider_session(order, payment, customer, provider_client=None):
    if payment.method not in ONLINE_METHODS or payment.provider_ref:
        return order, payment
    if order.reservation_expires_at and order.reservation_expires_at <= timezone.now():
        _expire_order(order, provider_client=provider_client)
        raise CheckoutError('This checkout expired. Start a new checkout.', status_code=409, code='checkout_expired')

    client = provider_client or PayMongoClient()
    try:
        provider_ref, checkout_url = client.create_checkout_session(
            order,
            payment,
            _payment_line_items(order),
            order.shipping_address,
            customer.email,
        )
    except PayMongoError as error:
        now = timezone.now()
        with transaction.atomic():
            locked_payment = OrdersPayment.objects.select_for_update().get(pk=payment.pk)
            locked_order = OrdersOrder.objects.select_for_update().get(pk=order.pk)
            if locked_payment.status == 'paid' or locked_payment.provider_ref:
                return locked_order, locked_payment
            from_status = locked_payment.status
            locked_payment.status = 'setup_failed'
            locked_payment.failure_code = error.code
            locked_payment.updated_at = now
            locked_payment.save(update_fields=['status', 'failure_code', 'updated_at'])
            record_payment_transition(
                locked_payment,
                to_status='setup_failed',
                from_status=from_status,
                actor_type='system_provider',
                reason=f'Provider session setup failed: {error.code}',
            )
            locked_order.status = 'payment_setup_failed'
            locked_order.updated_at = now
            locked_order.save(update_fields=['status', 'updated_at'])
        raise CheckoutError(
            'Online payment setup is temporarily unavailable. Retry with the same checkout.',
            status_code=503 if error.retryable else 422,
            code=error.code,
        ) from error

    now = timezone.now()
    with transaction.atomic():
        locked_payment = OrdersPayment.objects.select_for_update().get(pk=payment.pk)
        locked_order = OrdersOrder.objects.select_for_update().get(pk=order.pk)
        if locked_payment.status == 'paid':
            return locked_order, locked_payment
        if locked_payment.provider_ref:
            return locked_order, locked_payment
        locked_payment.provider_ref = provider_ref
        locked_payment.checkout_url = checkout_url
        locked_payment.status = 'awaiting_payment'
        locked_payment.failure_code = None
        locked_payment.updated_at = now
        locked_payment.save(update_fields=['provider_ref', 'checkout_url', 'status', 'failure_code', 'updated_at'])
        locked_order.status = 'pending_payment'
        locked_order.updated_at = now
        locked_order.save(update_fields=['status', 'updated_at'])
    return locked_order, locked_payment


def execute_checkout(customer, payload, provider_client=None):
    checkout, fingerprint = validate_checkout_payload(payload)
    existing = OrdersOrder.objects.filter(checkout_idempotency_key=checkout['idempotency_key']).first()
    if existing:
        if existing.customer_id != customer.id or existing.checkout_fingerprint != fingerprint:
            raise CheckoutError(
                'Idempotency key was already used for another checkout.',
                status_code=409,
                code='idempotency_conflict',
            )
        payment = existing.payments.order_by('-created_at').first()
        return (*_ensure_provider_session(existing, payment, customer, provider_client), True)

    try:
        with transaction.atomic():
            order, payment, reused_attempt = _build_order(customer, checkout, fingerprint)
    except IntegrityError as error:
        existing = OrdersOrder.objects.filter(checkout_idempotency_key=checkout['idempotency_key']).first()
        if not existing:
            raise
        if existing.customer_id != customer.id or existing.checkout_fingerprint != fingerprint:
            raise CheckoutError('Idempotency conflict.', status_code=409, code='idempotency_conflict') from error
        payment = existing.payments.order_by('-created_at').first()
        return (*_ensure_provider_session(existing, payment, customer, provider_client), True)

    order, payment = _ensure_provider_session(order, payment, customer, provider_client)
    return order, payment, reused_attempt


def apply_verified_payment(payment, session_data):
    paid_payment = verified_paid_payment(session_data, payment.amount, payment.currency)
    if not paid_payment:
        return False
    provider_payment_ref = paid_payment.get('id')
    now = timezone.now()
    with transaction.atomic():
        locked = OrdersPayment.objects.select_for_update().select_related('order').get(pk=payment.pk)
        if locked.status == 'paid':
            return True
        from_status = locked.status
        locked.status = 'paid'
        locked.provider_payment_ref = provider_payment_ref
        locked.paid_at = now
        locked.last_reconciled_at = now
        locked.failure_code = None
        locked.updated_at = now
        locked.save(update_fields=[
            'status',
            'provider_payment_ref',
            'paid_at',
            'last_reconciled_at',
            'failure_code',
            'updated_at',
        ])
        record_payment_transition(
            locked,
            to_status='paid',
            from_status=from_status,
            actor_type='system_webhook' if 'evt_' in str(provider_payment_ref) else 'system_reconciliation',
            provider_event_id=provider_payment_ref,
            reason='Verified online payment confirmation',
            metadata={'provider_payment_ref': provider_payment_ref},
        )
        order = locked.order
        stock_committed = not order.cancelled_at and _commit_reservations(order)
        order.status = 'placed' if stock_committed else 'payment_review'
        order.updated_at = now
        order.save(update_fields=['status', 'updated_at'])
    return True


def reconcile_payment(payment, provider_client=None):
    if payment.method not in ONLINE_METHODS or not payment.provider_ref or payment.status == 'paid':
        return payment.status
    now = timezone.now()
    reconciliation_cutoff = now - timedelta(seconds=30)
    claimed = OrdersPayment.objects.filter(
        pk=payment.pk,
        method__in=ONLINE_METHODS,
        provider_ref__isnull=False,
    ).exclude(status='paid').filter(
        Q(last_reconciled_at__isnull=True) | Q(last_reconciled_at__lte=reconciliation_cutoff)
    ).update(last_reconciled_at=now)
    if not claimed:
        payment.refresh_from_db(fields=['status', 'last_reconciled_at'])
        return payment.status
    payment.refresh_from_db()
    client = provider_client or PayMongoClient()
    if payment.order.reservation_expires_at and payment.order.reservation_expires_at <= now:
        _expire_order(payment.order, provider_client=client)
        payment.refresh_from_db()
        return payment.status
    session_data = client.retrieve_checkout_session(payment.provider_ref)
    if apply_verified_payment(payment, session_data):
        return 'paid'
    attributes = session_data.get('data', {}).get('attributes', {})
    if attributes.get('status') == 'expired':
        with transaction.atomic():
            locked_payment = OrdersPayment.objects.select_for_update().get(pk=payment.pk)
            locked_order = OrdersOrder.objects.select_for_update().get(pk=locked_payment.order_id)
            if locked_payment.status == 'paid':
                return 'paid'
            if locked_payment.status in {'cancelled', 'expired'} or locked_order.status in {'cancelled', 'payment_expired'}:
                return locked_payment.status
            _release_reservations(locked_order, final_status='expired')
            from_status = locked_payment.status
            locked_payment.status = 'expired'
            locked_payment.failure_code = None
            locked_payment.updated_at = now
            locked_payment.save(update_fields=['status', 'failure_code', 'updated_at'])
            record_payment_transition(
                locked_payment,
                to_status='expired',
                from_status=from_status,
                actor_type='system_reconciliation',
                reason='Provider reported checkout expired',
            )
            locked_order.status = 'payment_expired'
            locked_order.cancelled_at = now
            locked_order.updated_at = now
            locked_order.save(update_fields=['status', 'cancelled_at', 'updated_at'])
        return 'expired'
    return payment.status


def cancel_checkout(order, provider_client=None):
    payment = order.payments.order_by('-created_at').first()
    if not payment:
        raise CheckoutError('Payment record not found.', status_code=409, code='payment_missing')
    if payment.status == 'paid':
        raise CheckoutError('Paid orders cannot be cancelled here.', status_code=409, code='already_paid')
    if payment.method == 'cod':
        raise CheckoutError(
            'Cash-on-delivery orders require the order cancellation workflow.',
            status_code=409,
            code='cod_cancellation_requires_support',
        )
    if order.status in {'cancelled', 'payment_expired'}:
        return order, payment
    if payment.provider_ref:
        (provider_client or PayMongoClient()).expire_checkout_session(payment.provider_ref)
    now = timezone.now()
    with transaction.atomic():
        locked_payment = OrdersPayment.objects.select_for_update().select_related('order').get(pk=payment.pk)
        locked_order = OrdersOrder.objects.select_for_update().get(pk=locked_payment.order_id)
        if locked_payment.status == 'paid':
            raise CheckoutError('Paid orders cannot be cancelled here.', status_code=409, code='already_paid')
        if locked_order.status in {'cancelled', 'payment_expired'}:
            return locked_order, locked_payment
        _release_reservations(locked_order)
        from_status = locked_payment.status
        locked_payment.status = 'cancelled'
        locked_payment.updated_at = now
        locked_payment.save(update_fields=['status', 'updated_at'])
        record_payment_transition(
            locked_payment,
            to_status='cancelled',
            from_status=from_status,
            actor_type='customer',
            actor_id=locked_order.customer_id,
            reason='Online checkout cancelled by customer',
        )
        locked_order.status = 'cancelled'
        locked_order.cancelled_at = now
        locked_order.updated_at = now
        locked_order.save(update_fields=['status', 'cancelled_at', 'updated_at'])
    return locked_order, locked_payment


def serialize_checkout(order, payment, is_replay=False):
    address = getattr(order, 'shipping_address', None)
    payment_action = None
    if payment.method in ONLINE_METHODS and payment.checkout_url and payment.status == 'awaiting_payment':
        payment_action = {
            'type': 'redirect',
            'url': payment.checkout_url,
            'provider': 'paymongo',
            'expires_at': order.reservation_expires_at.isoformat() if order.reservation_expires_at else None,
        }
    return {
        'id': order.id,
        'order_no': f'MD-{order.created_at.year}-{order.id:05d}',
        'status': order.status,
        'subtotal': str(order.subtotal),
        'shipping': str(order.shipping),
        'tax': str(order.tax),
        'discount': str(order.discount),
        'total': str(order.total),
        'currency': order.currency,
        'payment_method': payment.method,
        'payment_status': payment.status,
        'payment_action': payment_action,
        'is_replay': is_replay,
        'created_at': order.created_at.isoformat(),
        'shipping_address': {
            'name': address.name,
            'address_line1': address.address_line1,
            'address_line2': address.address_line2 or '',
            'city': address.city,
            'state': address.state,
            'postal_code': address.postal_code or '',
            'country': address.country,
            'phone': address.phone,
        } if address else None,
        'items': [
            {
                'product_ref': line.product_id,
                'variant_ref': line.variant_id,
                'product_name': line.product_name_snapshot or line.product.name,
                'sku': line.sku_snapshot or (line.variant.sku if line.variant else line.product.sku),
                'variant_desc': line.variant_desc_snapshot or None,
                'quantity': line.quantity,
                'unit_price': str(line.unit_price),
                'total_price': str(line.total_price),
            }
            for line in order.lines.select_related('product', 'variant').all()
        ],
    }
