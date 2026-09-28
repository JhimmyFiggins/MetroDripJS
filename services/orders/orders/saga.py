import json
import uuid
import urllib.request
import urllib.error
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from .models import (
    OrdersOrder,
    OrdersOrderLine,
    OrdersShippingAddress,
    OrdersPayment,
    OrdersStockHold,
    OrdersOutboxMessage,
    OrdersIdempotencyRecord,
)

class SagaExecutionError(Exception):
    def __init__(self, message, status_code=400, details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _http_post_json(url, payload, headers=None, timeout=3.0):
    data = json.dumps(payload).encode('utf-8')
    req_headers = {'Content-Type': 'application/json'}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {'error': str(e)}
        return e.code, parsed
    except Exception as e:
        raise SagaExecutionError(f"HTTP call to {url} failed: {str(e)}", status_code=503)


def execute_cod_checkout_saga(customer_id, items, shipping_address_data, delivery_zone='NCR (Metro Manila)', idempotency_key=None):
    """
    Executes the COD checkout saga with local transactions, durable intent,
    replay protection, and recovery.
    """
    if not idempotency_key:
        idempotency_key = str(uuid.uuid4())

    # 1. Idempotency Check
    existing_rec = OrdersIdempotencyRecord.objects.select_related('order').filter(key=idempotency_key).first()
    if existing_rec:
        if existing_rec.order.customer_ref != customer_id:
            raise SagaExecutionError('Idempotency key is unavailable.', status_code=409)
        if existing_rec.order.status == 'pending_stock_confirmation':
            raise SagaExecutionError('Stock confirmation is pending; retry with the same idempotency key.', status_code=503)
        if existing_rec.order.status == 'cancelled':
            raise SagaExecutionError('This checkout was cancelled.', status_code=409)
        return existing_rec.order, True

    catalog_url = getattr(settings, 'CATALOG_SERVICE_URL', 'http://127.0.0.1:8002')
    fulfillment_url = getattr(settings, 'FULFILLMENT_SERVICE_URL', 'http://127.0.0.1:8004')
    headers = {'X-Internal-Token': getattr(settings, 'INTERNAL_TOKEN', '')}

    # 2. Get authoritative quote from Catalog Service
    quote_status, quote_data = _http_post_json(f"{catalog_url}/api/catalog/quote/", {'items': items}, headers=headers, timeout=3.0)
    if quote_status != 200:
        err_msg = quote_data.get('error', 'Failed to obtain price quote from catalog.')
        raise SagaExecutionError(err_msg, status_code=quote_status)

    quote_items = quote_data.get('items', [])
    subtotal = quote_data.get('subtotal', 0)

    # A failed quote cannot authorize a guessed shipping charge.
    ship_status, ship_data = _http_post_json(
        f"{fulfillment_url}/api/fulfillment/shipping-quote/",
        {'zone_name': delivery_zone, 'address': shipping_address_data},
        headers=headers, timeout=2.0
    )
    if ship_status != 200:
        raise SagaExecutionError(ship_data.get('error', 'Shipping quote unavailable.'), status_code=ship_status)
    shipping_fee = ship_data.get('fee')
    if type(shipping_fee) is not int or shipping_fee < 0:
        raise SagaExecutionError('Invalid shipping quote.', status_code=502)

    total = subtotal + shipping_fee

    # 4. Reserve stock in Catalog Service
    checkout_id = f"chk_{uuid.uuid4().hex[:16]}"
    ttl_seconds = 600

    reserve_status, reserve_data = _http_post_json(
        f"{catalog_url}/api/catalog/reserve/",
        {
            'checkout_id': checkout_id,
            'ttl_seconds': ttl_seconds,
            'items': [{'variant_id': qi['variant_ref'], 'quantity': qi['quantity']} for qi in quote_items],
        },
        headers=headers,
        timeout=3.0
    )

    if reserve_status not in (200, 201):
        err = reserve_data.get('error', 'Stock reservation failed.')
        raise SagaExecutionError(err, status_code=reserve_status)

    # 5. Local Orders Database Transaction: Order, Snapshots, Payment, Outbox
    expires_at = timezone.now() + timedelta(seconds=ttl_seconds)

    try:
        with transaction.atomic():
            last_order = OrdersOrder.objects.select_for_update().order_by('-id').first()
            next_id = (last_order.id + 1) if last_order else 319
            order_no = f"MD-2026-00{next_id:03d}"

            order = OrdersOrder.objects.create(
                id=next_id,
                order_no=order_no,
                customer_ref=customer_id,
                status='pending_stock_confirmation',
                subtotal=subtotal,
                shipping=shipping_fee,
                tax=0,
                discount=0,
                total=total,
                currency='PHP',
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )

            OrdersShippingAddress.objects.create(
                order=order,
                name=shipping_address_data.get('name', 'Valued Customer'),
                address_line1=shipping_address_data.get('address_line1', shipping_address_data.get('address', '')),
                address_line2=shipping_address_data.get('address_line2', ''),
                city=shipping_address_data.get('city', 'Quezon City'),
                state=shipping_address_data.get('state', 'Metro Manila (NCR)'),
                postal_code=shipping_address_data.get('postal_code', '1100'),
                country='PH',
                phone=shipping_address_data.get('phone', ''),
            )

            for qi in quote_items:
                OrdersOrderLine.objects.create(
                    order=order,
                    product_ref=qi['product_ref'],
                    variant_ref=qi['variant_ref'],
                    sku_snapshot=qi['sku'],
                    product_name_snapshot=qi['product_name'],
                    variant_desc_snapshot=qi.get('variant_desc', ''),
                    quantity=qi['quantity'],
                    unit_price=qi['unit_price'],
                    total_price=qi['line_total'],
                    created_at=timezone.now(),
                )

            OrdersPayment.objects.create(
                order=order,
                method='cod',
                status='pending_collection',
                amount=total,
                currency='PHP',
                metadata={'delivery_zone': delivery_zone},
            )

            OrdersStockHold.objects.update_or_create(
                checkout_id=checkout_id,
                defaults={
                    'order': order,
                    'state': 'active',
                    'expires_at': expires_at,
                }
            )

            OrdersOutboxMessage.objects.create(
                topic='OrderPlaced',
                payload={
                    'order_id': order.id,
                    'order_no': order.order_no,
                    'customer_ref': customer_id,
                    'total': total,
                    'delivery_zone': delivery_zone,
                    'created_at': order.created_at.isoformat(),
                },
                state='pending',
                correlation_id=idempotency_key,
            )

            OrdersIdempotencyRecord.objects.create(
                key=idempotency_key,
                order=order,
            )
    except Exception:
        # The catalog reservation was created in step 4 BEFORE this local
        # transaction. If the local write fails, the reservation must be
        # released so stock is not permanently double-locked. The release is
        # best-effort: the catalog TTL will also eventually expire it.
        try:
            _http_post_json(
                f"{catalog_url}/api/catalog/reserve/{checkout_id}/release/",
                {}, headers=headers, timeout=2.0
            )
        except Exception:
            pass
        raise

    # 6. Commit Stock Reservation in Catalog Service
    try:
        commit_status, commit_data = _http_post_json(
            f"{catalog_url}/api/catalog/reserve/{checkout_id}/commit/",
            {'order_ref': order.id},
            headers=headers,
            timeout=3.0
        )
    except SagaExecutionError as error:
        # The remote commit may have succeeded; releasing it here is unsafe.
        raise SagaExecutionError('Stock confirmation is pending; retry with the same idempotency key.', status_code=503) from error
    if commit_status >= 500:
        raise SagaExecutionError('Stock confirmation is pending; retry with the same idempotency key.', status_code=503)
    if commit_status != 200:
        release_status = None
        try:
            release_status, _ = _http_post_json(
                f"{catalog_url}/api/catalog/reserve/{checkout_id}/release/", {}, headers=headers, timeout=2.0)
        except SagaExecutionError:
            pass
        with transaction.atomic():
            order.status = 'cancelled'
            order.save(update_fields=['status'])
            OrdersStockHold.objects.filter(checkout_id=checkout_id).update(
                state='released' if release_status == 200 else 'release_pending')
            OrdersOutboxMessage.objects.filter(correlation_id=idempotency_key).update(state='cancelled')
        raise SagaExecutionError('Stock confirmation failed; order has been cancelled.', status_code=409)

    with transaction.atomic():
        order.status = 'placed'
        order.updated_at = timezone.now()
        order.save(update_fields=['status', 'updated_at'])
        OrdersStockHold.objects.filter(checkout_id=checkout_id).update(
            state='committed', committed_at=timezone.now())

    return order, False
