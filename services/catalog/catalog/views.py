import hashlib
import json
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import (
    CatalogCategory,
    CatalogProduct,
    CatalogColor,
    CatalogProductVariant,
    InventoryStockEntry,
    InventoryReservation,
    InventoryStockMovement,
)
from .permissions import IsInternalService, IsMerchantOrAdmin


class HealthCheckAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({
            'status': 'ok',
            'service': 'catalog',
            'timestamp': timezone.now().isoformat(),
        })


class ProductsAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request, pk=None):
        if pk is not None:
            product = CatalogProduct.objects.filter(pk=pk, is_active=True).first()
            if not product:
                return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

            variants_data = []
            for v in product.variants.filter(is_active=True).select_related('color'):
                stock = InventoryStockEntry.objects.filter(variant=v).first()
                avail_qty = stock.available_quantity if stock else 0
                variants_data.append({
                    'id': v.id,
                    'sku': v.sku,
                    'color_name': v.color.name if v.color else '',
                    'color_hex': v.color.hex_code if v.color else '',
                    'attributes': v.attributes,
                    'price_adjustment': v.price_adjustment,
                    'final_price': v.final_price,
                    'stock': avail_qty,
                    'in_stock': avail_qty > 0,
                })

            return Response({
                'id': product.id,
                'sku': product.sku,
                'name': product.name,
                'description': product.description,
                'image_url': product.image_url,
                'category_id': product.category_id,
                'category_name': product.category.name if product.category else '',
                'base_price': product.base_price,
                'currency': product.currency,
                'is_featured': product.is_featured,
                'variants': variants_data,
            })

        qs = CatalogProduct.objects.filter(is_active=True).select_related('category')

        # Filters
        cat = request.query_params.get('category')
        if cat:
            qs = qs.filter(category__slug=cat) | qs.filter(category_id=cat if cat.isdigit() else None)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(sku__icontains=search)

        sort = request.query_params.get('sort', 'newest')
        if sort == 'price_asc':
            qs = qs.order_by('base_price')
        elif sort == 'price_desc':
            qs = qs.order_by('-base_price')
        else:
            qs = qs.order_by('-created_at')

        results = []
        for p in qs[:50]:
            # Calculate total available stock across variants
            total_stock = sum(
                s.available_quantity
                for s in InventoryStockEntry.objects.filter(product=p)
            )
            results.append({
                'id': p.id,
                'sku': p.sku,
                'name': p.name,
                'description': p.description,
                'image_url': p.image_url,
                'category_id': p.category_id,
                'category_name': p.category.name if p.category else '',
                'base_price': p.base_price,
                'currency': p.currency,
                'is_featured': p.is_featured,
                'total_stock': total_stock,
                'in_stock': total_stock > 0,
            })

        return Response(results)


class CategoriesAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        cats = CatalogCategory.objects.filter(is_active=True).order_by('name')
        return Response([
            {
                'id': c.id,
                'name': c.name,
                'slug': c.slug,
                'description': c.description,
                'parent_id': c.parent_id,
            }
            for c in cats
        ])


class VariantsAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, pk=None):
        if pk is not None:
            v = CatalogProductVariant.objects.filter(pk=pk, is_active=True).select_related('product', 'color').first()
            if not v:
                return Response({'error': 'Variant not found.'}, status=status.HTTP_404_NOT_FOUND)
            stock = InventoryStockEntry.objects.filter(variant=v).first()
            avail = stock.available_quantity if stock else 0
            return Response({
                'id': v.id,
                'product_id': v.product_id,
                'product_name': v.product.name,
                'sku': v.sku,
                'attributes': v.attributes,
                'final_price': v.final_price,
                'stock': avail,
            })

        product_id = request.query_params.get('product')
        qs = CatalogProductVariant.objects.filter(is_active=True)
        if product_id and product_id.isdigit():
            qs = qs.filter(product_id=int(product_id))

        results = []
        for v in qs[:100]:
            stock = InventoryStockEntry.objects.filter(variant=v).first()
            results.append({
                'id': v.id,
                'product_id': v.product_id,
                'sku': v.sku,
                'attributes': v.attributes,
                'final_price': v.final_price,
                'stock': stock.available_quantity if stock else 0,
            })
        return Response(results)


# ==============================================================================
# SAGA CONTRACTS: Quote, Expiring Reservation, Idempotent Commit/Release
# ==============================================================================

class CatalogQuoteAPIView(APIView):
    """
    Authoritative server pricing and stock quote for Orders checkout saga.
    Client-computed prices are strictly ignored.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        items = request.data.get('items', [])
        if not items or not isinstance(items, list):
            return Response({'error': 'items list is required.'}, status=status.HTTP_400_BAD_REQUEST)

        quote_items = []
        subtotal = 0

        for item in items:
            variant_id = item.get('variant_id') or item.get('variant')
            qty = item.get('quantity') or item.get('qty', 1)

            try:
                qty = int(qty)
                if qty <= 0:
                    return Response({'error': f'Invalid quantity {qty}. Must be positive.'}, status=400)
            except (ValueError, TypeError):
                return Response({'error': 'Quantity must be an integer.'}, status=400)

            variant = CatalogProductVariant.objects.filter(id=variant_id, is_active=True).select_related('product').first()
            if not variant:
                return Response({'error': f'Variant {variant_id} not found or inactive.'}, status=404)

            stock = InventoryStockEntry.objects.filter(variant=variant).first()
            avail = stock.available_quantity if stock else 0
            if avail < qty:
                return Response({
                    'error': f'Insufficient stock for SKU {variant.sku}. Requested {qty}, available {avail}.',
                    'variant_id': variant.id,
                    'available': avail,
                }, status=status.HTTP_409_CONFLICT)

            unit_price = variant.final_price
            line_total = unit_price * qty
            subtotal += line_total

            quote_items.append({
                'product_ref': variant.product.id,
                'variant_ref': variant.id,
                'sku': variant.sku,
                'product_name': variant.product.name,
                'variant_desc': f"{variant.attributes.get('size', '')} / {variant.attributes.get('color', '')}".strip(' /'),
                'unit_price': unit_price,
                'quantity': qty,
                'line_total': line_total,
                'available_stock': avail,
            })

        # Generate line-item fingerprint
        fingerprint_raw = json.dumps([
            {'v': qi['variant_ref'], 'q': qi['quantity'], 'p': qi['unit_price']}
            for qi in quote_items
        ], sort_keys=True)
        fingerprint = hashlib.sha256(fingerprint_raw.encode()).hexdigest()[:32]

        expires_at = timezone.now() + timedelta(minutes=15)

        return Response({
            'valid': True,
            'currency': 'PHP',
            'subtotal': subtotal,
            'fingerprint': fingerprint,
            'expires_at': expires_at.isoformat(),
            'items': quote_items,
        })


class CatalogReserveStockAPIView(APIView):
    """
    Saga Step 3: Checkout-only stock reservation under checkout_id with TTL.
    Locks stock atomically with select_for_update().
    """
    def post(self, request):
        checkout_id = request.data.get('checkout_id')
        items = request.data.get('items', [])
        ttl_seconds = int(request.data.get('ttl_seconds', 600))

        if not checkout_id or not items:
            return Response({'error': 'checkout_id and items are required.'}, status=400)

        with transaction.atomic():
            # Idempotency check: if reservation already active for checkout_id
            existing = InventoryReservation.objects.filter(checkout_id=checkout_id, status='active').first()
            if existing:
                return Response({
                    'success': True,
                    'checkout_id': checkout_id,
                    'status': 'active',
                    'expires_at': existing.expires_at.isoformat(),
                    'message': 'Reservation already active.',
                })

            expires_at = timezone.now() + timedelta(seconds=ttl_seconds)
            created_holds = []

            for item in items:
                v_id = item.get('variant_id') or item.get('variant_ref')
                qty = int(item.get('quantity', 1))

                variant = CatalogProductVariant.objects.select_related('product').filter(id=v_id).first()
                if not variant:
                    return Response({'error': f'Variant {v_id} not found.'}, status=404)

                # Lock stock entry with select_for_update
                stock = InventoryStockEntry.objects.select_for_update().filter(variant=variant).first()
                if not stock or (stock.quantity - stock.reserved_quantity) < qty:
                    # Rollback transaction automatically on exception / return error
                    transaction.set_rollback(True)
                    return Response({
                        'success': False,
                        'error': f'Insufficient stock for {variant.sku}.',
                        'variant_id': v_id,
                    }, status=status.HTTP_409_CONFLICT)

                stock.reserved_quantity += qty
                stock.updated_at = timezone.now()
                stock.save(update_fields=['reserved_quantity', 'updated_at'])

                res = InventoryReservation.objects.create(
                    checkout_id=checkout_id,
                    product=variant.product,
                    variant=variant,
                    quantity=qty,
                    status='active',
                    expires_at=expires_at,
                    created_at=timezone.now(),
                )
                created_holds.append(res)

                InventoryStockMovement.objects.create(
                    variant=variant,
                    sku=variant.sku,
                    delta=-qty,
                    reason='reservation_hold',
                )

            return Response({
                'success': True,
                'checkout_id': checkout_id,
                'status': 'reserved',
                'expires_at': expires_at.isoformat(),
                'reserved_count': len(created_holds),
            }, status=status.HTTP_201_CREATED)


class CatalogCommitReservationAPIView(APIView):
    """
    Saga Step 5: Orders or its worker sends idempotent commit command.
    Permanently decrements on-hand stock and releases reserved quantity.
    """
    def post(self, request, checkout_id):
        order_ref = request.data.get('order_ref')

        with transaction.atomic():
            reservations = InventoryReservation.objects.select_for_update().filter(checkout_id=checkout_id)
            if not reservations.exists():
                return Response({'error': f'No reservation found for checkout {checkout_id}.'}, status=404)

            # Check if already committed (idempotency)
            if all(r.status == 'committed' for r in reservations):
                return Response({'success': True, 'checkout_id': checkout_id, 'status': 'committed', 'idempotent': True})

            for res in reservations:
                if res.status == 'active':
                    stock = InventoryStockEntry.objects.select_for_update().filter(variant=res.variant).first()
                    if stock:
                        stock.quantity = max(0, stock.quantity - res.quantity)
                        stock.reserved_quantity = max(0, stock.reserved_quantity - res.quantity)
                        stock.updated_at = timezone.now()
                        stock.save(update_fields=['quantity', 'reserved_quantity', 'updated_at'])

                    res.status = 'committed'
                    res.ended_at = timezone.now()
                    if order_ref:
                        res.order_ref = int(order_ref)
                    res.save(update_fields=['status', 'ended_at', 'order_ref'])

                    InventoryStockMovement.objects.create(
                        variant=res.variant,
                        sku=res.variant.sku,
                        delta=-res.quantity,
                        reason='sale',
                        ref_order_ref=int(order_ref) if order_ref else None,
                    )

            return Response({'success': True, 'checkout_id': checkout_id, 'status': 'committed'})


class CatalogReleaseReservationAPIView(APIView):
    """
    Saga Compensation: Release stock hold on checkout cancellation or expiry.
    """
    def post(self, request, checkout_id):
        with transaction.atomic():
            reservations = InventoryReservation.objects.select_for_update().filter(checkout_id=checkout_id, status='active')
            if not reservations.exists():
                return Response({'success': True, 'checkout_id': checkout_id, 'status': 'already_released_or_not_found'})

            for res in reservations:
                stock = InventoryStockEntry.objects.select_for_update().filter(variant=res.variant).first()
                if stock:
                    stock.reserved_quantity = max(0, stock.reserved_quantity - res.quantity)
                    stock.updated_at = timezone.now()
                    stock.save(update_fields=['reserved_quantity', 'updated_at'])

                res.status = 'released'
                res.ended_at = timezone.now()
                res.save(update_fields=['status', 'ended_at'])

                InventoryStockMovement.objects.create(
                    variant=res.variant,
                    sku=res.variant.sku,
                    delta=res.quantity,
                    reason='release',
                )

            return Response({'success': True, 'checkout_id': checkout_id, 'status': 'released'})


# ==============================================================================
# MERCHANT CATALOG & INVENTORY VIEWS
# ==============================================================================

class MerchantInventoryAPIView(APIView):
    def get(self, request):
        entries = InventoryStockEntry.objects.select_related('product', 'variant').all().order_by('id')
        data = []
        for e in entries:
            data.append({
                'id': e.id,
                'product_id': e.product_id,
                'product_name': e.product.name if e.product else '',
                'sku': e.variant.sku if e.variant else (e.product.sku if e.product else ''),
                'variant_id': e.variant_id,
                'quantity': e.quantity,
                'reserved_quantity': e.reserved_quantity,
                'available': e.available_quantity,
                'last_counted': e.last_counted_at.isoformat() if e.last_counted_at else None,
            })
        return Response(data)

    def post(self, request):
        """Stock adjustment (e.g. restock +15)"""
        variant_id = request.data.get('variant_id')
        delta = request.data.get('delta')
        reason = request.data.get('reason', 'adjustment')

        if not variant_id or delta is None:
            return Response({'error': 'variant_id and delta are required.'}, status=400)

        try:
            delta = int(delta)
        except (ValueError, TypeError):
            return Response({'error': 'delta must be an integer.'}, status=400)

        variant = CatalogProductVariant.objects.filter(id=variant_id).first()
        if not variant:
            return Response({'error': 'Variant not found.'}, status=404)

        with transaction.atomic():
            stock, _ = InventoryStockEntry.objects.select_for_update().get_or_create(
                product=variant.product,
                variant=variant,
                defaults={'warehouse_id': 1, 'quantity': 0, 'reserved_quantity': 0}
            )
            new_qty = max(0, stock.quantity + delta)
            stock.quantity = new_qty
            stock.last_counted_at = timezone.now()
            stock.updated_at = timezone.now()
            stock.save()

            InventoryStockMovement.objects.create(
                variant=variant,
                sku=variant.sku,
                delta=delta,
                reason=reason,
            )

        return Response({
            'success': True,
            'variant_id': variant.id,
            'sku': variant.sku,
            'new_quantity': stock.quantity,
            'available': stock.available_quantity,
        })
