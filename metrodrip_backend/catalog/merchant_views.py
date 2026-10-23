import csv
import os
import re
import uuid
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.text import get_valid_filename
from django.db import transaction
from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from identity.authentication import CustomerTokenAuthentication
from identity.permissions import IsMerchantOrAdminRole
from catalog.models import (
    CatalogProduct,
    CatalogProductVariant,
    CatalogCategory,
    InventoryStockEntry,
    InventoryStockMovement,
    CatalogProductMedia,
)
from orders.models import (
    OrdersOrder,
    OrdersOrderLine,
    OrdersShippingAddress,
    OrdersPayment,
    ReviewsReview,
)
from fulfillment.models import ShippingShipment, ShippingShippingZone
from content.models import CmsHomepageBanner



class MerchantAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsMerchantOrAdminRole]


def _parse_boolean(value):
    if isinstance(value, bool):
        return value
    raise ValueError('must be a boolean')


def _detect_image_mime(file_obj):
    """
    Zero-dependency magic byte validation for JPEG, PNG, and WebP.
    Rejects SVGs, HTML, script polyglots, executable headers, and corrupt files.
    """
    initial_pos = file_obj.tell() if hasattr(file_obj, 'tell') else 0
    header = file_obj.read(16)
    if hasattr(file_obj, 'seek'):
        file_obj.seek(initial_pos)

    if len(header) < 12:
        return None

    # JPEG starts with FF D8 FF
    if header.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    # PNG starts with 89 50 4E 47 0D 0A 1A 0A
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    # WebP: 'RIFF' at 0..4 and 'WEBP' at 8..12
    if header.startswith(b'RIFF') and header[8:12] == b'WEBP':
        return 'image/webp'

    return None


class MerchantDashboardAPIView(MerchantAPIView):
    def get(self, request):
        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Orders metrics
        orders_today_qs = OrdersOrder.objects.filter(created_at__gte=start_of_day)
        orders_count = orders_today_qs.count()
        paid_orders_count = orders_today_qs.filter(payments__status='paid').distinct().count()
        pending_orders_count = orders_today_qs.filter(payments__status__in=['awaiting_payment', 'setup_failed']).distinct().count()

        sales_sum = orders_today_qs.filter(payments__status='paid').distinct().aggregate(total=Sum('total'))['total'] or 0

        # Low stock SKUs: items with stock <= 5
        low_stock_entries = InventoryStockEntry.objects.filter(quantity__lte=5).select_related('product', 'variant')
        low_stock_count = low_stock_entries.count()

        low_stock_alerts = []
        for entry in low_stock_entries[:6]:
            prod_name = entry.product.name
            sku = entry.variant.sku if entry.variant else entry.product.sku
            attributes = entry.variant.attributes if entry.variant and isinstance(entry.variant.attributes, dict) else {}
            variant_desc = ' · '.join(str(value).upper() for value in attributes.values() if value) or None
            low_stock_alerts.append({
                'product': prod_name,
                'variant': variant_desc,
                'on_hand': entry.quantity,
                'min': 10,
                'sku': sku,
            })

        # Recent orders
        recent_orders_qs = (
            OrdersOrder.objects.select_related('shipping_address')
            .prefetch_related('payments')
            .order_by('-created_at')[:6]
        )
        recent_orders = []
        for order in recent_orders_qs:
            address = getattr(order, 'shipping_address', None)
            payment = _latest_payment(order)
            recent_orders.append({
                'order_no': _order_number(order),
                'customer': address.name if address else None,
                'total': str(order.total),
                'payment_method': payment.method if payment else None,
                'payment_status': payment.status if payment else None,
                'status': order.status.replace('_', ' ').title(),
            })

        to_ship_count = OrdersOrder.objects.filter(status__in=['placed', 'paid', 'processing', 'packed']).count()

        return Response({
            'metrics': {
                'today_sales': f"₱{int(sales_sum):,}",
                'today_sales_trend': None,
                'orders_today': orders_count,
                'orders_today_breakdown': f"{paid_orders_count} paid · {pending_orders_count} awaiting payment",
                'low_stock_skus': low_stock_count,
                'to_ship': to_ship_count,
            },
            'low_stock_alerts': low_stock_alerts,
            'recent_orders': recent_orders,
        })


class MerchantProductsAPIView(MerchantAPIView):
    def get(self, request):
        products = CatalogProduct.objects.all().select_related('category').prefetch_related('variants', 'stock_entries', 'media')
        data = []
        for p in products:
            total_stock = sum(e.quantity for e in p.stock_entries.all())
            reserved_stock = sum(e.reserved_quantity for e in p.stock_entries.all())
            available_stock = sum(max(0, e.quantity - e.reserved_quantity) for e in p.stock_entries.all())
            variant_count = p.variants.count()
            data.append({
                'id': p.id,
                'name': p.name,
                'category': p.category.name if p.category else None,
                'sku': p.sku,
                'image_url': p.image_url or '',
                'variants_count': variant_count,
                'stock': total_stock,
                'total_stock': total_stock,
                'reserved_stock': reserved_stock,
                'available_stock': available_stock,
                'price': int(p.base_price),
                'price_formatted': f"₱{int(p.base_price):,}",
                'is_active': p.is_active,
                'status': 'Active' if p.is_active else 'Inactive',
            })
        return Response(data)

    def post(self, request):
        data = request.data
        raw_name = data.get('name')
        raw_category = data.get('category')
        raw_sku = data.get('sku')
        description = data.get('description', '')
        if not all(isinstance(value, str) and value.strip() for value in (raw_name, raw_category, raw_sku)):
            return Response(
                {'error': 'Product name, category, and SKU are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(description, str):
            return Response({'error': 'description must be text.'}, status=status.HTTP_400_BAD_REQUEST)

        name = raw_name.strip()
        cat_name = raw_category.strip()
        sku = raw_sku.strip()
        try:
            price = Decimal(str(data.get('price'))).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'price must be a positive amount.'}, status=status.HTTP_400_BAD_REQUEST)
        stock_value = data.get('stock')
        if isinstance(stock_value, bool):
            return Response({'error': 'stock must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            parsed_stock_value = Decimal(str(stock_value))
            if not parsed_stock_value.is_finite() or parsed_stock_value != parsed_stock_value.to_integral_value():
                raise ValueError
            stock_qty = int(parsed_stock_value)
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'stock must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if not price.is_finite() or price <= 0 or stock_qty < 0:
            return Response(
                {'error': 'price must be positive and stock must be a non-negative integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if CatalogProduct.objects.filter(sku__iexact=sku).exists() or CatalogProductVariant.objects.filter(sku__iexact=sku).exists():
            return Response({'error': 'SKU is already in use.'}, status=status.HTTP_409_CONFLICT)

        now = timezone.now()
        with transaction.atomic():
            category, _ = CatalogCategory.objects.get_or_create(
                name=cat_name,
                defaults={
                    'slug': cat_name.lower().replace(' › ', '-').replace(' ', '-'),
                    'description': cat_name,
                    'is_active': True,
                    'created_at': now,
                    'updated_at': now,
                },
            )
            product = CatalogProduct.objects.create(
                name=name,
                sku=sku,
                description=description.strip(),
                category=category,
                base_price=price,
                currency='PHP',
                is_active=True,
                is_featured=False,
                created_at=now,
                updated_at=now,
            )
            # The form captures a primary SKU but no size/color attributes.
            # Persist an attribute-free variant instead of inventing metadata.
            variant = CatalogProductVariant.objects.create(
                product=product,
                sku=sku,
                attributes={},
                price_adjustment=Decimal('0.00'),
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            InventoryStockEntry.objects.create(
                product=product,
                variant=variant,
                warehouse_id=1,
                quantity=stock_qty,
                reserved_quantity=0,
                last_counted_at=now,
                created_at=now,
                updated_at=now,
            )
            if stock_qty:
                InventoryStockMovement.objects.create(
                    variant=variant,
                    sku=variant.sku,
                    delta=stock_qty,
                    reason='restock',
                )

        return Response({
            'id': product.id,
            'name': product.name,
            'sku': product.sku,
            'category': category.name,
            'stock': stock_qty,
            'price': int(product.base_price),
            'status': 'Active',
        }, status=status.HTTP_201_CREATED)


class MerchantProductDetailAPIView(MerchantAPIView):
    def get(self, request, pk):
        try:
            product = CatalogProduct.objects.select_related('category').prefetch_related('variants', 'stock_entries', 'media').get(pk=pk)
        except CatalogProduct.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        total_stock = sum(e.quantity for e in product.stock_entries.all())
        reserved_stock = sum(e.reserved_quantity for e in product.stock_entries.all())
        available_stock = sum(max(0, e.quantity - e.reserved_quantity) for e in product.stock_entries.all())
        media_list = [
            {
                'id': m.id,
                'url': m.url,
                'alt_text': m.alt_text,
                'sort_order': m.sort_order,
                'is_primary': m.is_primary,
                'mime_type': m.mime_type,
                'byte_size': m.byte_size,
            }
            for m in product.media.all().order_by('sort_order', 'id')
        ]
        return Response({
            'id': product.id,
            'name': product.name,
            'sku': product.sku,
            'image_url': product.image_url or '',
            'media': media_list,
            'category': product.category.name if product.category else None,
            'category_id': product.category.id if product.category else None,
            'price': int(product.base_price),
            'price_formatted': f"₱{int(product.base_price):,}",
            'stock': total_stock,
            'total_stock': total_stock,
            'reserved_stock': reserved_stock,
            'available_stock': available_stock,
            'is_active': product.is_active,
            'status': 'Active' if product.is_active else 'Inactive',
            'description': product.description or '',
        })

    def patch(self, request, pk):
        try:
            product = CatalogProduct.objects.select_related('category').prefetch_related('variants', 'stock_entries').get(pk=pk)
        except CatalogProduct.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        if 'name' in data and (not isinstance(data['name'], str) or not data['name'].strip()):
            return Response({'error': 'name must be non-empty text.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'sku' in data and (not isinstance(data['sku'], str) or not data['sku'].strip()):
            return Response({'error': 'sku must be non-empty text.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'description' in data and not isinstance(data['description'], str):
            return Response({'error': 'description must be text.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'category' in data and (not isinstance(data['category'], str) or not data['category'].strip()):
            return Response({'error': 'category must be non-empty text.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'is_active' in data and not isinstance(data['is_active'], bool):
            return Response({'error': 'is_active must be a boolean.'}, status=status.HTTP_400_BAD_REQUEST)

        parsed_price = None
        if 'price' in data:
            try:
                parsed_price = Decimal(str(data['price'])).quantize(Decimal('0.01'))
            except (InvalidOperation, TypeError, ValueError):
                return Response({'error': 'price must be a positive amount.'}, status=status.HTTP_400_BAD_REQUEST)
            if not parsed_price.is_finite() or parsed_price <= 0:
                return Response({'error': 'price must be a positive amount.'}, status=status.HTTP_400_BAD_REQUEST)

        parsed_stock = None
        if 'stock' in data:
            if isinstance(data['stock'], bool):
                return Response({'error': 'stock must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                parsed_stock_value = Decimal(str(data['stock']))
                if not parsed_stock_value.is_finite() or parsed_stock_value != parsed_stock_value.to_integral_value():
                    raise ValueError
                parsed_stock = int(parsed_stock_value)
            except (InvalidOperation, TypeError, ValueError):
                return Response({'error': 'stock must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)
            if parsed_stock < 0:
                return Response({'error': 'stock must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)

        proposed_sku = data['sku'].strip() if 'sku' in data else product.sku
        if CatalogProduct.objects.filter(sku__iexact=proposed_sku).exclude(pk=product.pk).exists():
            return Response({'error': 'SKU is already in use.'}, status=status.HTTP_409_CONFLICT)
        if CatalogProductVariant.objects.filter(sku__iexact=proposed_sku).exclude(product=product).exists():
            return Response({'error': 'SKU is already in use.'}, status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            product = CatalogProduct.objects.select_for_update().get(pk=pk)
            previous_sku = product.sku
            stock_entries = []
            if parsed_stock is not None:
                stock_entries = list(
                    InventoryStockEntry.objects.select_for_update().filter(product=product).order_by('id')
                )
                if len(stock_entries) > 1:
                    return Response(
                        {
                            'error': 'This product has multiple warehouse stock rows. Adjust a specific SKU instead.',
                            'code': 'warehouse_stock_ambiguous',
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                if stock_entries and parsed_stock < stock_entries[0].reserved_quantity:
                    return Response(
                        {'error': 'Stock cannot be lower than the reserved quantity.', 'code': 'stock_reserved'},
                        status=status.HTTP_409_CONFLICT,
                    )
                if not stock_entries and not product.variants.exists():
                    return Response(
                        {'error': 'A product variant is required before setting stock.', 'code': 'variant_required'},
                        status=status.HTTP_409_CONFLICT,
                    )

            if 'name' in data:
                product.name = data['name'].strip()
            if parsed_price is not None:
                product.base_price = parsed_price
            product.sku = proposed_sku
            if 'is_active' in data:
                product.is_active = data['is_active']
            if 'description' in data:
                product.description = data['description'].strip()
            if 'category' in data:
                cat_name = data['category'].strip()
                category, _ = CatalogCategory.objects.get_or_create(
                    name=cat_name,
                    defaults={
                        'slug': cat_name.lower().replace(' › ', '-').replace(' ', '-'),
                        'description': cat_name,
                        'is_active': True,
                        'created_at': timezone.now(),
                        'updated_at': timezone.now(),
                    },
                )
                product.category = category

            product.updated_at = timezone.now()
            product.save()

            primary_variant = product.variants.order_by('id').first()
            if proposed_sku != previous_sku and primary_variant and primary_variant.sku == previous_sku:
                primary_variant.sku = proposed_sku
                primary_variant.updated_at = timezone.now()
                primary_variant.save(update_fields=['sku', 'updated_at'])

            if parsed_stock is not None:
                stock_entry = stock_entries[0] if stock_entries else None
                variant = stock_entry.variant if stock_entry else product.variants.order_by('id').first()
                old_stock = stock_entry.quantity if stock_entry else 0
                delta = parsed_stock - old_stock
                if stock_entry:
                    stock_entry.quantity = parsed_stock
                    stock_entry.updated_at = timezone.now()
                    stock_entry.save(update_fields=['quantity', 'updated_at'])
                else:
                    InventoryStockEntry.objects.create(
                        product=product,
                        variant=variant,
                        warehouse_id=1,
                        quantity=parsed_stock,
                        reserved_quantity=0,
                        last_counted_at=timezone.now(),
                        created_at=timezone.now(),
                        updated_at=timezone.now(),
                    )
                if delta:
                    InventoryStockMovement.objects.create(
                        variant=variant,
                        sku=variant.sku,
                        delta=delta,
                        reason='manual_adjustment',
                    )

        product.refresh_from_db()
        stock_entries = list(product.stock_entries.all())
        total_stock = sum(e.quantity for e in stock_entries)
        reserved_stock = sum(e.reserved_quantity for e in stock_entries)
        available_stock = sum(max(0, e.quantity - e.reserved_quantity) for e in stock_entries)
        media_list = [
            {
                'id': m.id,
                'url': m.url,
                'alt_text': m.alt_text,
                'sort_order': m.sort_order,
                'is_primary': m.is_primary,
                'mime_type': m.mime_type,
                'byte_size': m.byte_size,
            }
            for m in product.media.all().order_by('sort_order', 'id')
        ]
        return Response({
            'id': product.id,
            'name': product.name,
            'sku': product.sku,
            'image_url': product.image_url or '',
            'media': media_list,
            'category': product.category.name if product.category else None,
            'category_id': product.category.id if product.category else None,
            'price': int(product.base_price),
            'price_formatted': f"₱{int(product.base_price):,}",
            'stock': total_stock,
            'total_stock': total_stock,
            'reserved_stock': reserved_stock,
            'available_stock': available_stock,
            'is_active': product.is_active,
            'status': 'Active' if product.is_active else 'Inactive',
            'description': product.description or '',
        })

    def delete(self, request, pk):
        try:
            product = CatalogProduct.objects.get(pk=pk)
            product.is_active = False
            product.save()
            return Response({'message': f'Product #{pk} deactivated successfully.'})
        except CatalogProduct.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)


class MerchantProductMediaAPIView(MerchantAPIView):
    def get(self, request, pk):
        try:
            product = CatalogProduct.objects.get(pk=pk)
        except CatalogProduct.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        media_items = product.media.all().order_by('sort_order', 'id')
        data = [
            {
                'id': m.id,
                'url': m.url,
                'alt_text': m.alt_text,
                'sort_order': m.sort_order,
                'is_primary': m.is_primary,
                'mime_type': m.mime_type,
                'byte_size': m.byte_size,
                'created_at': m.created_at,
            }
            for m in media_items
        ]
        return Response(data)

    def post(self, request, pk):
        try:
            product = CatalogProduct.objects.get(pk=pk)
        except CatalogProduct.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        if product.media.count() >= 12:
            return Response({'error': 'Maximum of 12 images allowed per product.'}, status=status.HTTP_400_BAD_REQUEST)

        file = request.FILES.get('file') or request.FILES.get('image')
        if not file:
            return Response({'error': 'An image file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if file.size > 8 * 1024 * 1024:
            return Response({'error': 'Image file size exceeds the 8 MiB limit.'}, status=status.HTTP_400_BAD_REQUEST)

        mime_type = _detect_image_mime(file)
        if not mime_type:
            return Response(
                {'error': 'Invalid image format. Only JPG, PNG, and WebP images are permitted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        alt_text = request.data.get('alt_text', '')
        if not isinstance(alt_text, str):
            alt_text = ''
        alt_text = alt_text.strip()[:255]

        req_is_primary = request.data.get('is_primary')
        is_primary = (req_is_primary in (True, 'true', 'True', '1', 1)) or (product.media.count() == 0)

        sort_order_raw = request.data.get('sort_order')
        try:
            sort_order = int(sort_order_raw) if sort_order_raw is not None else product.media.count()
        except (ValueError, TypeError):
            sort_order = product.media.count()

        with transaction.atomic():
            if is_primary:
                product.media.filter(is_primary=True).update(is_primary=False)

            media = CatalogProductMedia.objects.create(
                product=product,
                file=file,
                alt_text=alt_text,
                sort_order=sort_order,
                is_primary=is_primary,
                mime_type=mime_type,
                byte_size=file.size,
            )

            if is_primary:
                product.image_url = media.url
                product.updated_at = timezone.now()
                product.save(update_fields=['image_url', 'updated_at'])

        return Response({
            'id': media.id,
            'url': media.url,
            'alt_text': media.alt_text,
            'sort_order': media.sort_order,
            'is_primary': media.is_primary,
            'mime_type': media.mime_type,
            'byte_size': media.byte_size,
            'created_at': media.created_at,
        }, status=status.HTTP_201_CREATED)


class MerchantProductMediaDetailAPIView(MerchantAPIView):
    def patch(self, request, pk, media_id):
        try:
            product = CatalogProduct.objects.get(pk=pk)
            media = CatalogProductMedia.objects.get(product=product, id=media_id)
        except (CatalogProduct.DoesNotExist, CatalogProductMedia.DoesNotExist):
            return Response({'error': 'Media item not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        with transaction.atomic():
            if 'alt_text' in data:
                alt = data['alt_text']
                media.alt_text = str(alt).strip()[:255] if alt else ''

            if 'sort_order' in data:
                try:
                    media.sort_order = max(0, int(data['sort_order']))
                except (ValueError, TypeError):
                    pass

            if 'is_primary' in data:
                make_primary = data['is_primary'] in (True, 'true', 'True', '1', 1)
                if make_primary:
                    product.media.exclude(id=media.id).filter(is_primary=True).update(is_primary=False)
                    media.is_primary = True
                    product.image_url = media.url
                    product.updated_at = timezone.now()
                    product.save(update_fields=['image_url', 'updated_at'])
                else:
                    if media.is_primary:
                        media.is_primary = False
                        other_media = product.media.exclude(id=media.id).order_by('sort_order', 'id').first()
                        if other_media:
                            other_media.is_primary = True
                            other_media.save(update_fields=['is_primary'])
                            product.image_url = other_media.url
                        else:
                            product.image_url = ''
                        product.updated_at = timezone.now()
                        product.save(update_fields=['image_url', 'updated_at'])

            media.updated_at = timezone.now()
            media.save()

        return Response({
            'id': media.id,
            'url': media.url,
            'alt_text': media.alt_text,
            'sort_order': media.sort_order,
            'is_primary': media.is_primary,
            'mime_type': media.mime_type,
            'byte_size': media.byte_size,
        })

    def delete(self, request, pk, media_id):
        try:
            product = CatalogProduct.objects.get(pk=pk)
            media = CatalogProductMedia.objects.get(product=product, id=media_id)
        except (CatalogProduct.DoesNotExist, CatalogProductMedia.DoesNotExist):
            return Response({'error': 'Media item not found.'}, status=status.HTTP_404_NOT_FOUND)

        was_primary = media.is_primary
        with transaction.atomic():
            try:
                if media.file:
                    media.file.delete(save=False)
            except Exception:
                pass

            media.delete()

            if was_primary:
                next_media = product.media.order_by('sort_order', 'id').first()
                if next_media:
                    next_media.is_primary = True
                    next_media.save(update_fields=['is_primary'])
                    product.image_url = next_media.url
                else:
                    product.image_url = ''
                product.updated_at = timezone.now()
                product.save(update_fields=['image_url', 'updated_at'])

        return Response({'message': 'Media removed successfully.'}, status=status.HTTP_200_OK)


class MerchantCategoriesAPIView(MerchantAPIView):
    def get(self, request):
        categories = CatalogCategory.objects.all().order_by('name')

        data = []
        for c in categories:
            prod_count = CatalogProduct.objects.filter(category=c).count()
            data.append({
                'id': c.id,
                'name': c.name,
                'slug': c.slug,
                'description': c.description or '',
                'product_count': prod_count,
                'is_active': c.is_active,
            })
        return Response(data)

    def post(self, request):
        raw_name = request.data.get('name', '')
        raw_description = request.data.get('description', '')
        raw_slug = request.data.get('slug')
        if not isinstance(raw_name, str) or not isinstance(raw_description, str):
            return Response(
                {'error': 'name and description must be text.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if raw_slug is not None and not isinstance(raw_slug, str):
            return Response({'error': 'slug must be text.'}, status=status.HTTP_400_BAD_REQUEST)

        name = raw_name.strip()
        description = raw_description.strip()
        if not name:
            return Response({'error': 'Category name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        slug = raw_slug.strip() if raw_slug else name.lower().replace(' › ', '-').replace(' ', '-')
        category, created = CatalogCategory.objects.get_or_create(
            name=name,
            defaults={
                'slug': slug,
                'description': description or name,
                'is_active': True,
                'created_at': timezone.now(),
                'updated_at': timezone.now(),
            }
        )
        prod_count = CatalogProduct.objects.filter(category=category).count()
        return Response({
            'id': category.id,
            'name': category.name,
            'slug': category.slug,
            'description': category.description,
            'product_count': prod_count,
            'is_active': category.is_active,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class MerchantRestockAPIView(MerchantAPIView):
    def post(self, request):
        sku = str(request.data.get('sku') or '').strip()
        reason = str(request.data.get('reason') or 'restock').strip().lower()

        if not sku:
            return Response({'error': 'SKU is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            raw_quantity = request.data.get('quantity')
            if isinstance(raw_quantity, bool):
                raise ValueError
            parsed_quantity = Decimal(str(raw_quantity))
            if not parsed_quantity.is_finite() or parsed_quantity != parsed_quantity.to_integral_value():
                raise ValueError
            qty = int(parsed_quantity)
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'quantity must be a positive integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if qty <= 0:
            return Response({'error': 'quantity must be a positive integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if reason not in {'restock', 'return', 'adjustment'}:
            return Response({'error': 'Select a supported restock reason.'}, status=status.HTTP_400_BAD_REQUEST)

        variant = CatalogProductVariant.objects.filter(sku=sku).first()
        if not variant:
            return Response({'error': 'Product variant not found.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            stock_entry = InventoryStockEntry.objects.select_for_update().filter(variant=variant).first()
            if stock_entry:
                stock_entry.quantity += qty
                stock_entry.updated_at = timezone.now()
                stock_entry.save(update_fields=['quantity', 'updated_at'])
            else:
                InventoryStockEntry.objects.create(
                    product=variant.product,
                    variant=variant,
                    warehouse_id=1,
                    quantity=qty,
                    reserved_quantity=0,
                    last_counted_at=timezone.now(),
                    created_at=timezone.now(),
                    updated_at=timezone.now(),
                )

            InventoryStockMovement.objects.create(
                variant=variant,
                sku=sku,
                delta=qty,
                reason=reason,
            )

        return Response({
            'status': 'success',
            'sku': sku,
            'quantity_added': qty,
            'reason': reason,
        })


class MerchantStockMovementsAPIView(MerchantAPIView):
    def get(self, request):
        movements = InventoryStockMovement.objects.all().order_by('-created_at')[:20]
        data = [
            {
                'id': m.id,
                'sku': m.sku or (m.variant.sku if m.variant else None),
                'delta': f"+{m.delta}" if m.delta > 0 else str(m.delta),
                'reason': m.reason,
                'when': m.created_at.strftime('%H:%M') if m.created_at else None,
            }
            for m in movements
        ]
        return Response(data)


class MerchantReviewsAPIView(MerchantAPIView):
    def get(self, request):
        reviews = ReviewsReview.objects.all().order_by('-created_at')[:20]
        data = [
            {
                'id': r.id,
                'customer': r.customer_name,
                'customer_name': r.customer_name,
                'product_name': r.product_name,
                'body': r.body,
                'product_review': f"{r.product_name} — “{r.body[:40] + '…' if len(r.body) > 40 else r.body}”",
                'rating_stars': '★' * r.rating + '☆' * (5 - r.rating),
                'rating': r.rating,
                'status': r.status,
                'merchant_reply': r.merchant_reply,
                'replied_at': r.replied_at.strftime('%Y-%m-%d %H:%M') if r.replied_at else None,
                'created_at': r.created_at.strftime('%Y-%m-%d %H:%M') if r.created_at else None,
            }
            for r in reviews
        ]
        return Response(data)


class MerchantReviewDetailAPIView(MerchantAPIView):
    def get(self, request, pk):
        try:
            review = ReviewsReview.objects.get(pk=pk)
            return Response({
                'id': review.id,
                'customer_name': review.customer_name,
                'product_name': review.product_name,
                'body': review.body,
                'rating': review.rating,
                'rating_stars': '★' * review.rating + '☆' * (5 - review.rating),
                'merchant_reply': review.merchant_reply,
                'replied_at': review.replied_at.strftime('%Y-%m-%d %H:%M') if review.replied_at else None,
                'created_at': review.created_at.strftime('%Y-%m-%d %H:%M') if review.created_at else None,
                'status': review.status,
            })
        except ReviewsReview.DoesNotExist:
            return Response({'error': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)


class MerchantReviewReplyAPIView(MerchantAPIView):
    def post(self, request, pk):
        raw_reply = request.data.get('reply', '')
        if not isinstance(raw_reply, str):
            return Response({'error': 'Reply text must be text.'}, status=status.HTTP_400_BAD_REQUEST)
        reply_text = raw_reply.strip()
        if not reply_text:
            return Response({'error': 'Reply text cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            review = ReviewsReview.objects.get(pk=pk)
            review.merchant_reply = reply_text
            review.replied_at = timezone.now()
            review.save()

            return Response({
                'id': review.id,
                'customer_name': review.customer_name,
                'product_name': review.product_name,
                'merchant_reply': review.merchant_reply,
                'replied_at': review.replied_at.strftime('%Y-%m-%d %H:%M'),
                'message': f'Reply successfully submitted for review #{pk}.',
            })
        except ReviewsReview.DoesNotExist:
            return Response({'error': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)


class MerchantReviewModerateAPIView(MerchantAPIView):
    """Deprecated: Retained for backwards compatibility."""
    def post(self, request, pk):
        new_status = str(request.data.get('status') or '').strip().lower()
        if new_status not in {'pending', 'approved', 'rejected'}:
            return Response(
                {'error': 'status must be pending, approved, or rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            review = ReviewsReview.objects.get(pk=pk)
            review.status = new_status
            review.save(update_fields=['status'])
        except ReviewsReview.DoesNotExist:
            return Response({'error': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'id': pk,
            'status': new_status,
            'message': f"Review #{pk} status updated to {new_status}.",
        })


FULFILLMENT_TRANSITIONS = {
    'placed': {'packed'},
    'paid': {'packed'},
    'processing': {'packed'},
    'packed': {'shipped'},
    'shipped': {'out_for_delivery'},
    'out_for_delivery': {'delivered'},
}


def _order_number(order):
    return f"MD-{order.created_at.year}-{order.id:05d}"


def _latest_payment(order):
    return max(order.payments.all(), key=lambda payment: payment.created_at, default=None)


def _csv_cell(value):
    text = '' if value is None else str(value)
    return "'" + text if text.startswith(('=', '+', '-', '@', '\t', '\r')) else text


def _merchant_order_summary(order):
    payment = _latest_payment(order)
    address = getattr(order, 'shipping_address', None)
    return {
        'id': order.id,
        'order_no': _order_number(order),
        'customer': address.name if address else None,
        'total': str(order.total),
        'payment_method': payment.method if payment else None,
        'payment_status': payment.status if payment else None,
        'status': order.status.replace('_', ' ').title(),
        'raw_status': order.status.lower(),
        'created_at': order.created_at.isoformat() if order.created_at else None,
    }


class MerchantOrdersAPIView(MerchantAPIView):
    def get(self, request, pk=None):
        if pk is not None:
            order = OrdersOrder.objects.select_related('shipping_address').prefetch_related('payments').filter(pk=pk).first()
            if not order:
                return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

            lines = []
            for line in order.lines.select_related('product', 'variant', 'variant__color').all():
                attributes = line.variant.attributes if line.variant and isinstance(line.variant.attributes, dict) else {}
                color = attributes.get('color') or (line.variant.color.name if line.variant and line.variant.color else None)
                variant_parts = [attributes.get('size'), color, attributes.get('fit')]
                lines.append({
                    'product_name': line.product_name_snapshot or line.product.name,
                    'sku': line.sku_snapshot or (line.variant.sku if line.variant else line.product.sku),
                    'variant_desc': line.variant_desc_snapshot or (' · '.join(str(part).upper() for part in variant_parts if part) or None),
                    'quantity': line.quantity,
                    'unit_price': str(line.unit_price),
                    'total_price': str(line.total_price),
                })

            transitions = [
                {
                    'id': t.id,
                    'from_status': t.from_status,
                    'to_status': t.to_status,
                    'actor_type': t.actor_type,
                    'actor_id': t.actor_id,
                    'provider_event_id': t.provider_event_id,
                    'reason': t.reason,
                    'created_at': t.created_at.isoformat(),
                }
                for t in order.payment_transitions.order_by('-created_at')
            ]

            address = getattr(order, 'shipping_address', None)
            payment = _latest_payment(order)
            response = _merchant_order_summary(order)
            response.update({
                'subtotal': str(order.subtotal),
                'shipping': str(order.shipping),
                'tax': str(order.tax),
                'discount': str(order.discount),
                'currency': order.currency,
                'payment_method': payment.method if payment else None,
                'payment_status': payment.status if payment else None,
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
                'lines': lines,
                'payment_transitions': transitions,
            })
            return Response(response)

        orders = (
            OrdersOrder.objects.select_related('shipping_address')
            .prefetch_related('payments')
            .order_by('-created_at')[:50]
        )
        return Response([_merchant_order_summary(order) for order in orders])

    def patch(self, request, pk):
        new_status = str(request.data.get('status') or '').strip().lower()
        if not new_status:
            return Response({'error': 'Status is required.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            order = OrdersOrder.objects.select_for_update().filter(pk=pk).first()
            if not order:
                return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
            current_status = order.status.lower()
            if new_status != current_status and new_status not in FULFILLMENT_TRANSITIONS.get(current_status, set()):
                return Response(
                    {
                        'error': f'Order cannot move from {current_status} to {new_status}.',
                        'code': 'invalid_status_transition',
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if new_status != current_status:
                order.status = new_status
                order.updated_at = timezone.now()
                order.save(update_fields=['status', 'updated_at'])

        return Response({
            'id': order.id,
            'order_no': _order_number(order),
            'status': order.status.replace('_', ' ').title(),
            'raw_status': order.status,
            'message': f"Order {_order_number(order)} is now {order.status.replace('_', ' ')}.",
        })


class MerchantOrdersExportAPIView(MerchantAPIView):
    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="metrodrip_merchant_orders_{timezone.now().strftime("%Y%m%d")}.csv"'
        writer = csv.writer(response)
        writer.writerow(['Order ID', 'Customer', 'Total', 'Payment', 'Status', 'Date'])

        orders = OrdersOrder.objects.select_related('shipping_address').prefetch_related('payments').order_by('-created_at')
        for order in orders:
            address = getattr(order, 'shipping_address', None)
            payment = _latest_payment(order)
            writer.writerow([
                _order_number(order),
                _csv_cell(address.name if address else ''),
                str(order.total),
                _csv_cell(payment.method if payment else ''),
                _csv_cell(order.status),
                order.created_at.isoformat() if order.created_at else '',
            ])

        return response


class MerchantAnalyticsAPIView(MerchantAPIView):
    def get(self, request):
        # Order revenue can be queried, but views, sessions, carts, attribution,
        # and comparison cohorts are not modeled. Returning the old design
        # fixture would present invented business metrics as production facts.
        return Response(
            {
                'error': 'Analytics instrumentation is not configured. No sample metrics were returned.',
                'code': 'analytics_unconfigured',
                'available_sources': ['orders', 'order_lines', 'payments'],
                'missing_sources': ['sessions', 'product_views', 'cart_events', 'attribution'],
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )

class MerchantShipmentsAPIView(MerchantAPIView):
    def get(self, request):
        shipments_qs = list(ShippingShipment.objects.all().order_by('-id'))
        order_map = {
            order.id: order
            for order in OrdersOrder.objects.filter(id__in=[shipment.order_ref for shipment in shipments_qs])
        }
        data = []
        for shipment in shipments_qs:
            order = order_map.get(shipment.order_ref)
            data.append({
                'id': shipment.id,
                'order_ref': shipment.order_ref,
                'order_no': _order_number(order) if order else None,
                'waybill_no': shipment.waybill_no,
                'tracking_no': shipment.tracking_no,
                'carrier': None,
                'carrier_source': 'unavailable',
                'status': shipment.status.replace('_', ' ').title(),
                'booked_at': shipment.booked_at.isoformat() if shipment.booked_at else None,
            })
        return Response(data)

    def post(self, request):
        order_ref = request.data.get('order_ref')
        if not order_ref:
            return Response({'error': 'order_ref is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order_ref_int = int(order_ref)
        except (TypeError, ValueError):
            return Response({'error': 'order_ref must be a valid order ID.'}, status=status.HTTP_400_BAD_REQUEST)
        if not OrdersOrder.objects.filter(pk=order_ref_int).exists():
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                'error': 'Courier booking is not configured. No waybill or tracking number was generated.',
                'code': 'carrier_integration_unconfigured',
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


class MerchantShipmentDetailAPIView(MerchantAPIView):
    def get(self, request, pk):
        shipment = ShippingShipment.objects.filter(pk=pk).first()
        if not shipment:
            return Response({'error': 'Shipment not found.'}, status=status.HTTP_404_NOT_FOUND)
        order = OrdersOrder.objects.filter(pk=shipment.order_ref).first()
        return Response({
            'id': shipment.id,
            'order_ref': shipment.order_ref,
            'order_no': _order_number(order) if order else None,
            'waybill_no': shipment.waybill_no,
            'tracking_no': shipment.tracking_no,
            'carrier': None,
            'carrier_source': 'unavailable',
            'status': shipment.status.replace('_', ' ').title(),
            'booked_at': shipment.booked_at.isoformat() if shipment.booked_at else None,
        })

    def patch(self, request, pk):
        shipment = ShippingShipment.objects.filter(pk=pk).first()
        if not shipment:
            return Response({'error': 'Shipment not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_status = str(request.data.get('status') or '').strip().lower()
        transitions = {
            'booked': {'picked_up', 'cancelled'},
            'picked_up': {'in_transit', 'exception'},
            'in_transit': {'out_for_delivery', 'exception'},
            'out_for_delivery': {'delivered', 'exception'},
            'exception': {'in_transit', 'out_for_delivery', 'cancelled'},
        }
        current_status = shipment.status.lower()
        if not new_status:
            return Response({'error': 'Status is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status != current_status and new_status not in transitions.get(current_status, set()):
            return Response(
                {'error': f'Shipment cannot move from {current_status} to {new_status}.', 'code': 'invalid_status_transition'},
                status=status.HTTP_409_CONFLICT,
            )
        if new_status != current_status:
            shipment.status = new_status
            shipment.save(update_fields=['status'])
        return Response({
            'id': shipment.id,
            'status': shipment.status.replace('_', ' ').title(),
            'message': f"Shipment #{shipment.id} is now {shipment.status.replace('_', ' ')}.",
        })


class MerchantShippingZonesAPIView(MerchantAPIView):
    def get(self, request):
        zones = ShippingShippingZone.objects.all().order_by('id')

        data = [
            {
                'id': z.id,
                'name': z.name,
                'fee': z.fee,
                'formatted_fee': f"₱{z.fee:,}",
                'is_active': z.is_active,
            }
            for z in zones
        ]
        return Response(data)

    def patch(self, request, pk):
        try:
            zone = ShippingShippingZone.objects.get(pk=pk)
        except ShippingShippingZone.DoesNotExist:
            return Response({'error': 'Shipping zone not found.'}, status=status.HTTP_404_NOT_FOUND)

        fee = request.data.get('fee')
        is_active = request.data.get('is_active')

        if fee is None and is_active is None:
            return Response({'error': 'Provide fee or is_active.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed_fee = int(fee) if fee is not None else None
        except (TypeError, ValueError):
            return Response({'error': 'fee must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if parsed_fee is not None and parsed_fee < 0:
            return Response({'error': 'fee must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if is_active is not None and not isinstance(is_active, bool):
            return Response({'error': 'is_active must be a boolean.'}, status=status.HTTP_400_BAD_REQUEST)

        if parsed_fee is not None:
            zone.fee = parsed_fee
        if is_active is not None:
            zone.is_active = is_active
        zone.save()

        return Response({
            'id': zone.id,
            'name': zone.name,
            'fee': zone.fee,
            'formatted_fee': f"₱{zone.fee:,}",
            'is_active': zone.is_active,
        })


class MerchantShippingEligibilityAPIView(MerchantAPIView):
    def post(self, request):
        address = str(request.data.get('address') or '').strip()

        if not address:
            return Response({'error': 'Address string is required.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                'error': 'Address-to-zone eligibility is not configured. No shipping quote was produced.',
                'code': 'shipping_eligibility_unconfigured',
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


BANNER_PLACEMENT_ALIASES = {
    'homepage hero': 'homepage_hero',
    'homepage secondary': 'homepage_secondary',
    'announcement bar': 'announcement_bar',
    'category banner': 'category_banner',
    'checkout footer': 'checkout_footer',
}
BANNER_PLACEMENTS = {value for value, _ in CmsHomepageBanner.PLACEMENT_CHOICES}


def _clean_banner_text(value, field, max_length, required=False):
    if not isinstance(value, str):
        raise ValueError(f'{field} must be text.')
    cleaned = value.strip()
    if required and not cleaned:
        raise ValueError(f'{field} is required.')
    if len(cleaned) > max_length:
        raise ValueError(f'{field} is too long.')
    return cleaned


def _clean_banner_url(value, field, max_length, allow_blank=False):
    cleaned = _clean_banner_text(value, field, max_length, required=not allow_blank)
    if not cleaned and allow_blank:
        return ''
    try:
        parsed = urlsplit(cleaned)
    except ValueError as error:
        raise ValueError(f'{field} must be an internal path or HTTPS URL.') from error
    is_internal = cleaned.startswith('/') and not cleaned.startswith('//')
    is_https = parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password
    if not (is_internal or is_https):
        raise ValueError(f'{field} must be an internal path or HTTPS URL.')
    return cleaned


def _parse_banner_datetime(value, field):
    if value in (None, ''):
        return None
    if not isinstance(value, str):
        raise ValueError(f'{field} must be an ISO-8601 date and time.')
    parsed = parse_datetime(value.strip())
    if parsed is None:
        raise ValueError(f'{field} must be an ISO-8601 date and time.')
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def _normalize_banner_placement(value):
    cleaned = _clean_banner_text(value, 'placement', 64, required=True).lower()
    normalized = BANNER_PLACEMENT_ALIASES.get(cleaned, cleaned.replace('-', '_').replace(' ', '_'))
    if normalized not in BANNER_PLACEMENTS:
        raise ValueError('Select a supported banner placement.')
    return normalized


def _banner_status(banner, now=None):
    now = now or timezone.now()
    if not banner.is_active:
        return 'Draft'
    if banner.starts_at and banner.starts_at > now:
        return 'Scheduled'
    if banner.ends_at and banner.ends_at <= now:
        return 'Ended'
    return 'Live'


HEX_COLOR_REGEX = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')
SUPPORTED_ARTWORK_MODES = {'graphic', 'image'}
SUPPORTED_ALIGNMENTS = {'left', 'center', 'right'}
SUPPORTED_FONT_SIZES = {'small', 'normal', 'large'}
SUPPORTED_IMAGE_FITS = {'cover', 'contain'}


def _clean_hex_color(value, field, default='#141414'):
    if value in (None, ''):
        return default
    if not isinstance(value, str):
        raise ValueError(f'{field} must be a valid hex color string (e.g. #d3ee42).')
    cleaned = value.strip()
    if not HEX_COLOR_REGEX.match(cleaned):
        raise ValueError(f'{field} must be a valid hex color (e.g. #d3ee42 or #141414).')
    return cleaned


def _clean_choice(value, field, supported_choices, default):
    if value in (None, ''):
        return default
    if not isinstance(value, str):
        raise ValueError(f'{field} must be one of {", ".join(sorted(supported_choices))}.')
    cleaned = value.strip().lower()
    if cleaned not in supported_choices:
        raise ValueError(f'{field} must be one of {", ".join(sorted(supported_choices))}.')
    return cleaned


def _clean_graphic_text(value, field, max_length, default=''):
    if value in (None, ''):
        return default
    cleaned = _clean_banner_text(value, field, max_length, required=False)
    if '<' in cleaned or '>' in cleaned:
        raise ValueError(f'{field} contains invalid characters.')
    return cleaned


def _serialize_banner(banner):
    state = _banner_status(banner)
    if state == 'Scheduled':
        schedule = banner.starts_at.isoformat()
    elif state == 'Live' and banner.ends_at:
        schedule = f'Until {banner.ends_at.isoformat()}'
    elif state == 'Live':
        schedule = 'Always on'
    elif state == 'Ended':
        schedule = f'Ended {banner.ends_at.isoformat()}'
    else:
        schedule = 'Not scheduled'
    return {
        'id': banner.id,
        'title': banner.title,
        'headline': banner.headline or banner.title,
        'subtext': banner.subtext,
        'button_label': banner.button_label,
        'placement': banner.placement,
        'placement_label': banner.get_placement_display(),
        'placement_source': 'persisted',
        'image_url': banner.image_url,
        'link_url': banner.link_url,
        'is_active': banner.is_active,
        'status': state,
        'schedule': schedule,
        'starts_at': banner.starts_at.isoformat() if banner.starts_at else None,
        'ends_at': banner.ends_at.isoformat() if banner.ends_at else None,
        'order': banner.order,
        'artwork_mode': getattr(banner, 'artwork_mode', 'graphic') or 'graphic',
        'graphic_text_main': getattr(banner, 'graphic_text_main', 'MD') if getattr(banner, 'graphic_text_main', None) is not None else 'MD',
        'graphic_text_tagline': getattr(banner, 'graphic_text_tagline', 'BUILT FOR THE STREETS') if getattr(banner, 'graphic_text_tagline', None) is not None else 'BUILT FOR THE STREETS',
        'graphic_text_sub': getattr(banner, 'graphic_text_sub', 'METRODRIP / MANILA') if getattr(banner, 'graphic_text_sub', None) is not None else 'METRODRIP / MANILA',
        'graphic_bg_color': getattr(banner, 'graphic_bg_color', '#d3ee42') or '#d3ee42',
        'graphic_text_color': getattr(banner, 'graphic_text_color', '#141414') or '#141414',
        'graphic_accent_color': getattr(banner, 'graphic_accent_color', '#141414') or '#141414',
        'graphic_alignment': getattr(banner, 'graphic_alignment', 'left') or 'left',
        'graphic_font_size': getattr(banner, 'graphic_font_size', 'normal') or 'normal',
        'image_fit': getattr(banner, 'image_fit', 'cover') or 'cover',
    }


class MerchantBannersAPIView(MerchantAPIView):
    def get(self, request):
        banners = CmsHomepageBanner.objects.all().order_by('order')

        return Response([_serialize_banner(banner) for banner in banners])

    def post(self, request):
        try:
            title = _clean_banner_text(request.data.get('title', ''), 'title', 200, required=True)
            headline = _clean_banner_text(request.data.get('headline', title), 'headline', 200, required=True)
            subtext = _clean_banner_text(request.data.get('subtext', ''), 'subtext', 255)
            button_label = _clean_banner_text(request.data.get('button_label', 'Shop Now'), 'button_label', 50)
            placement = _normalize_banner_placement(request.data.get('placement', 'homepage_hero'))
            link_url = _clean_banner_url(request.data.get('link_url', '/shop'), 'link_url', 200)
            image_url = _clean_banner_url(request.data.get('image_url', ''), 'image_url', 254, allow_blank=True)
            artwork_mode = _clean_choice(request.data.get('artwork_mode'), 'artwork_mode', SUPPORTED_ARTWORK_MODES, 'graphic')
            graphic_text_main = _clean_graphic_text(request.data.get('graphic_text_main', 'MD'), 'graphic_text_main', 50, 'MD')
            graphic_text_tagline = _clean_graphic_text(request.data.get('graphic_text_tagline', 'BUILT FOR THE STREETS'), 'graphic_text_tagline', 100, 'BUILT FOR THE STREETS')
            graphic_text_sub = _clean_graphic_text(request.data.get('graphic_text_sub', 'METRODRIP / MANILA'), 'graphic_text_sub', 100, 'METRODRIP / MANILA')
            graphic_bg_color = _clean_hex_color(request.data.get('graphic_bg_color', '#d3ee42'), 'graphic_bg_color', '#d3ee42')
            graphic_text_color = _clean_hex_color(request.data.get('graphic_text_color', '#141414'), 'graphic_text_color', '#141414')
            graphic_accent_color = _clean_hex_color(request.data.get('graphic_accent_color', '#141414'), 'graphic_accent_color', '#141414')
            graphic_alignment = _clean_choice(request.data.get('graphic_alignment'), 'graphic_alignment', SUPPORTED_ALIGNMENTS, 'left')
            graphic_font_size = _clean_choice(request.data.get('graphic_font_size'), 'graphic_font_size', SUPPORTED_FONT_SIZES, 'normal')
            image_fit = _clean_choice(request.data.get('image_fit'), 'image_fit', SUPPORTED_IMAGE_FITS, 'cover')
            raw_order = request.data.get('order', 1)
            if isinstance(raw_order, bool):
                raise ValueError('order must be an integer from 0 to 32767.')
            order = int(raw_order)
            if order < 0 or order > 32767:
                raise ValueError('order must be an integer from 0 to 32767.')
            starts_at = _parse_banner_datetime(request.data.get('starts_at'), 'starts_at')
            ends_at = _parse_banner_datetime(request.data.get('ends_at'), 'ends_at')
            raw_state = request.data.get('status')
            if raw_state is None:
                is_active = _parse_boolean(request.data.get('is_active', False))
                publication_state = 'live' if is_active else 'draft'
            elif isinstance(raw_state, str) and raw_state.strip().lower() in {'draft', 'live', 'scheduled'}:
                publication_state = raw_state.strip().lower()
                is_active = publication_state != 'draft'
            else:
                raise ValueError('status must be Draft, Live, or Scheduled.')
            if publication_state == 'scheduled' and (not starts_at or starts_at <= timezone.now()):
                raise ValueError('A scheduled banner requires a future starts_at date and time.')
            if publication_state == 'live':
                starts_at = None
            if publication_state == 'draft':
                starts_at = None
                ends_at = None
            if ends_at and ends_at <= (starts_at or timezone.now()):
                raise ValueError('ends_at must be later than the publication start.')
        except (TypeError, ValueError) as error:
            return Response({'error': str(error)}, status=status.HTTP_400_BAD_REQUEST)

        banner = CmsHomepageBanner.objects.create(
            title=title,
            headline=headline,
            subtext=subtext,
            button_label=button_label,
            placement=placement,
            image_url=image_url,
            link_url=link_url,
            is_active=is_active,
            starts_at=starts_at,
            ends_at=ends_at,
            order=order,
            artwork_mode=artwork_mode,
            graphic_text_main=graphic_text_main,
            graphic_text_tagline=graphic_text_tagline,
            graphic_text_sub=graphic_text_sub,
            graphic_bg_color=graphic_bg_color,
            graphic_text_color=graphic_text_color,
            graphic_accent_color=graphic_accent_color,
            graphic_alignment=graphic_alignment,
            graphic_font_size=graphic_font_size,
            image_fit=image_fit,
        )
        return Response(_serialize_banner(banner), status=status.HTTP_201_CREATED)


class MerchantBannerDetailAPIView(MerchantAPIView):
    def patch(self, request, pk):
        try:
            banner = CmsHomepageBanner.objects.get(pk=pk)
        except CmsHomepageBanner.DoesNotExist:
            return Response({'error': 'Banner not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            data = request.data
            if 'title' in data:
                banner.title = _clean_banner_text(data['title'], 'title', 200, required=True)
            if 'headline' in data:
                banner.headline = _clean_banner_text(data['headline'], 'headline', 200, required=True)
            if 'subtext' in data:
                banner.subtext = _clean_banner_text(data['subtext'], 'subtext', 255)
            if 'button_label' in data:
                banner.button_label = _clean_banner_text(data['button_label'], 'button_label', 50)
            if 'placement' in data:
                banner.placement = _normalize_banner_placement(data['placement'])
            if 'link_url' in data:
                banner.link_url = _clean_banner_url(data['link_url'], 'link_url', 200)
            if 'image_url' in data:
                banner.image_url = _clean_banner_url(data['image_url'], 'image_url', 254, allow_blank=True)
            if 'artwork_mode' in data:
                banner.artwork_mode = _clean_choice(data['artwork_mode'], 'artwork_mode', SUPPORTED_ARTWORK_MODES, 'graphic')
            if 'graphic_text_main' in data:
                banner.graphic_text_main = _clean_graphic_text(data['graphic_text_main'], 'graphic_text_main', 50, 'MD')
            if 'graphic_text_tagline' in data:
                banner.graphic_text_tagline = _clean_graphic_text(data['graphic_text_tagline'], 'graphic_text_tagline', 100, 'BUILT FOR THE STREETS')
            if 'graphic_text_sub' in data:
                banner.graphic_text_sub = _clean_graphic_text(data['graphic_text_sub'], 'graphic_text_sub', 100, 'METRODRIP / MANILA')
            if 'graphic_bg_color' in data:
                banner.graphic_bg_color = _clean_hex_color(data['graphic_bg_color'], 'graphic_bg_color', '#d3ee42')
            if 'graphic_text_color' in data:
                banner.graphic_text_color = _clean_hex_color(data['graphic_text_color'], 'graphic_text_color', '#141414')
            if 'graphic_accent_color' in data:
                banner.graphic_accent_color = _clean_hex_color(data['graphic_accent_color'], 'graphic_accent_color', '#141414')
            if 'graphic_alignment' in data:
                banner.graphic_alignment = _clean_choice(data['graphic_alignment'], 'graphic_alignment', SUPPORTED_ALIGNMENTS, 'left')
            if 'graphic_font_size' in data:
                banner.graphic_font_size = _clean_choice(data['graphic_font_size'], 'graphic_font_size', SUPPORTED_FONT_SIZES, 'normal')
            if 'image_fit' in data:
                banner.image_fit = _clean_choice(data['image_fit'], 'image_fit', SUPPORTED_IMAGE_FITS, 'cover')
            if 'order' in data:
                if isinstance(data['order'], bool):
                    raise ValueError('order must be an integer from 0 to 32767.')
                banner.order = int(data['order'])
                if banner.order < 0 or banner.order > 32767:
                    raise ValueError('order must be an integer from 0 to 32767.')
            if 'starts_at' in data:
                banner.starts_at = _parse_banner_datetime(data['starts_at'], 'starts_at')
            if 'ends_at' in data:
                banner.ends_at = _parse_banner_datetime(data['ends_at'], 'ends_at')

            raw_state = data.get('status')
            if raw_state is not None:
                if not isinstance(raw_state, str) or raw_state.strip().lower() not in {'draft', 'live', 'scheduled'}:
                    raise ValueError('status must be Draft, Live, or Scheduled.')
                publication_state = raw_state.strip().lower()
                banner.is_active = publication_state != 'draft'
                if publication_state == 'draft':
                    banner.starts_at = None
                    banner.ends_at = None
                elif publication_state == 'live':
                    banner.starts_at = None
            elif 'is_active' in data:
                banner.is_active = _parse_boolean(data['is_active'])
                if not banner.is_active:
                    banner.starts_at = None
                    banner.ends_at = None

            effective_state = _banner_status(banner)
            if raw_state is not None and raw_state.strip().lower() == 'scheduled':
                if not banner.starts_at or banner.starts_at <= timezone.now():
                    raise ValueError('A scheduled banner requires a future starts_at date and time.')
            schedule_changed = bool({'status', 'is_active', 'starts_at', 'ends_at'} & set(data))
            if schedule_changed and banner.ends_at and banner.ends_at <= (banner.starts_at or timezone.now()):
                raise ValueError('ends_at must be later than the publication start.')
            if schedule_changed and effective_state == 'Ended' and raw_state is not None:
                raise ValueError('A published banner cannot end in the past.')
        except (TypeError, ValueError) as error:
            return Response({'error': str(error)}, status=status.HTTP_400_BAD_REQUEST)

        banner.save()
        response = _serialize_banner(banner)
        response['message'] = f'Banner "{banner.title}" updated successfully.'
        return Response(response)

    def delete(self, request, pk):
        try:
            banner = CmsHomepageBanner.objects.get(pk=pk)
            banner.delete()
            return Response({'message': 'Banner deleted successfully.'})
        except CmsHomepageBanner.DoesNotExist:
            return Response({'error': 'Banner not found.'}, status=status.HTTP_404_NOT_FOUND)


class MerchantBannerUploadAPIView(MerchantAPIView):
    def post(self, request):
        file = request.FILES.get('file') or request.FILES.get('image')
        if not file:
            return Response({'error': 'An image file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if file.size > 5 * 1024 * 1024:
            return Response({'error': 'Image file size exceeds the 5 MiB limit.'}, status=status.HTTP_400_BAD_REQUEST)

        mime_type = _detect_image_mime(file)
        if not mime_type:
            return Response(
                {'error': 'Invalid image format. Only JPG, PNG, and WebP images are permitted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ext = mime_type.split('/')[-1].replace('jpeg', 'jpg')
        now_str = timezone.now().strftime('%Y%m%d_%H%M%S')
        unique_token = uuid.uuid4().hex[:10]
        raw_name = file.name or 'banner_upload'
        safe_base = os.path.splitext(get_valid_filename(raw_name))[0][:40] or 'banner'
        filename = f'banners/{now_str}_{unique_token}_{safe_base}.{ext}'

        saved_path = default_storage.save(filename, file)
        file_url = default_storage.url(saved_path)

        return Response({
            'url': file_url,
            'mime_type': mime_type,
            'byte_size': file.size,
            'filename': os.path.basename(saved_path),
        }, status=status.HTTP_201_CREATED)
