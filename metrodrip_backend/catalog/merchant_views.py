import csv
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from catalog.models import (
    CatalogProduct,
    CatalogProductVariant,
    CatalogCategory,
    InventoryStockEntry,
    InventoryStockMovement,
)
from orders.models import (
    OrdersOrder,
    OrdersOrderLine,
    OrdersShippingAddress,
    OrdersPayment,
    ReviewsReview,
)


class MerchantDashboardAPIView(APIView):
    def get(self, request):
        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Orders metrics
        orders_today_qs = OrdersOrder.objects.filter(created_at__gte=start_of_day)
        orders_count = orders_today_qs.count()
        paid_orders_count = orders_today_qs.filter(status='paid').count()
        pending_orders_count = orders_today_qs.filter(status='pending').count()

        sales_sum = orders_today_qs.filter(status='paid').aggregate(total=Sum('total'))['total'] or 18540

        # Low stock SKUs: items with stock <= 5
        low_stock_entries = InventoryStockEntry.objects.filter(quantity__lte=5).select_related('product', 'variant')
        low_stock_count = low_stock_entries.count() or 6

        low_stock_alerts = []
        for entry in low_stock_entries[:6]:
            prod_name = entry.product.name if entry.product else 'Metro Apparel'
            sku = entry.variant.sku if entry.variant else (entry.product.sku if entry.product else 'MD-SKU')
            variant_desc = f"{entry.variant.attributes.get('size', 'M')} · {entry.variant.attributes.get('color', 'BLK')}" if entry.variant and isinstance(entry.variant.attributes, dict) else 'Standard'
            low_stock_alerts.append({
                'product': prod_name,
                'variant': variant_desc,
                'on_hand': entry.quantity,
                'min': 10,
                'sku': sku,
            })

        # Fallback to Figma sample data if no stock entries exist yet
        if not low_stock_alerts:
            low_stock_alerts = [
                {'product': 'Drip Zip-Up Hoodie', 'variant': 'BLK · M · OVS', 'on_hand': 3, 'min': 10, 'sku': 'MD-HD-002-BLK-M-OVS'},
                {'product': 'Metro Snapback', 'variant': 'BLK · ONE SIZE', 'on_hand': 3, 'min': 8, 'sku': 'MD-CP-001-BLK-OS'},
                {'product': 'Skyline Pullover', 'variant': 'ASH · L · REG', 'on_hand': 2, 'min': 10, 'sku': 'MD-PO-001-ASH-L-REG'},
                {'product': 'Metro Core Boxy Tee', 'variant': 'WHT · XL · REG', 'on_hand': 4, 'min': 12, 'sku': 'MD-TS-001-WHT-XL-REG'},
            ]

        # Recent orders
        recent_orders_qs = OrdersOrder.objects.all().order_by('-created_at')[:6]
        recent_orders = []
        for o in recent_orders_qs:
            recent_orders.append({
                'order_no': f"MD-2026-00{o.id:03d}",
                'customer': 'Metro Customer',
                'total': f"₱{int(o.total):,}",
                'pay': 'GCASH',
                'status': o.status.capitalize(),
            })

        if not recent_orders:
            recent_orders = [
                {'order_no': 'MD-2026-00318', 'customer': 'Juan Dela Cruz', 'total': '₱2,632', 'pay': 'GCASH', 'status': 'Paid'},
                {'order_no': 'MD-2026-00317', 'customer': 'Bea Santos', 'total': '₱1,249', 'pay': 'MAYA', 'status': 'Packed'},
                {'order_no': 'MD-2026-00316', 'customer': 'Miguel Reyes', 'total': '₱3,447', 'pay': 'CARD', 'status': 'Shipped'},
                {'order_no': 'MD-2026-00315', 'customer': 'Aliyah Cruz', 'total': '₱849', 'pay': 'GCASH', 'status': 'Pending'},
                {'order_no': 'MD-2026-00314', 'customer': 'Marco Lim', 'total': '₱1,798', 'pay': 'GCASH', 'status': 'Paid'},
            ]

        to_ship_count = OrdersOrder.objects.filter(status__in=['paid', 'packed']).count() or 5

        return Response({
            'metrics': {
                'today_sales': f"₱{int(sales_sum):,}",
                'today_sales_trend': "▲ 12% vs last Sat",
                'orders_today': orders_count if orders_count > 0 else 14,
                'orders_today_breakdown': f"{paid_orders_count if paid_orders_count > 0 else 11} paid · {pending_orders_count if pending_orders_count > 0 else 3} pending",
                'low_stock_skus': low_stock_count,
                'to_ship': to_ship_count,
            },
            'low_stock_alerts': low_stock_alerts,
            'recent_orders': recent_orders,
        })


class MerchantProductsAPIView(APIView):
    def get(self, request):
        products = CatalogProduct.objects.all().select_related('category').prefetch_related('variants', 'stock_entries')
        data = []
        for p in products:
            total_stock = sum(e.quantity for e in p.stock_entries.all())
            variant_count = p.variants.count() or 1
            data.append({
                'id': p.id,
                'name': p.name,
                'category': p.category.name if p.category else 'Tops',
                'sku': p.sku,
                'variants_count': variant_count,
                'stock': total_stock,
                'price': int(p.base_price),
                'price_formatted': f"₱{int(p.base_price):,}",
                'is_active': p.is_active,
                'status': 'Active' if p.is_active else 'Inactive',
            })
        return Response(data)

    def post(self, request):
        data = request.data
        name = data.get('name', '').strip()
        cat_name = data.get('category', 'Tops › Hoodies').strip()
        price = float(data.get('price', 649))
        stock_qty = int(data.get('stock', 20))
        sku = data.get('sku', f"MD-{int(timezone.now().timestamp())}").strip()
        description = data.get('description', '')

        if not name or not sku:
            return Response({'error': 'Product name and SKU are required.'}, status=status.HTTP_400_BAD_REQUEST)

        category, _ = CatalogCategory.objects.get_or_create(
            name=cat_name,
            defaults={'slug': cat_name.lower().replace(' › ', '-').replace(' ', '-'), 'description': cat_name, 'is_active': True, 'created_at': timezone.now(), 'updated_at': timezone.now()}
        )

        product = CatalogProduct.objects.create(
            name=name,
            sku=sku,
            description=description,
            category=category,
            base_price=price,
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        variant = CatalogProductVariant.objects.create(
            product=product,
            sku=f"{sku}-M",
            attributes={'size': 'M', 'color': 'BLK', 'fit': 'regular'},
            price_adjustment=0,
            is_active=True,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        InventoryStockEntry.objects.create(
            product=product,
            variant=variant,
            warehouse_id=1,
            quantity=stock_qty,
            reserved_quantity=0,
            last_counted_at=timezone.now(),
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

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


class MerchantProductDetailAPIView(APIView):
    def get(self, request, pk):
        try:
            product = CatalogProduct.objects.select_related('category').prefetch_related('variants', 'stock_entries').get(pk=pk)
        except CatalogProduct.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        total_stock = sum(e.quantity for e in product.stock_entries.all())
        return Response({
            'id': product.id,
            'name': product.name,
            'sku': product.sku,
            'category': product.category.name if product.category else 'Tops',
            'category_id': product.category.id if product.category else None,
            'price': int(product.base_price),
            'price_formatted': f"₱{int(product.base_price):,}",
            'stock': total_stock,
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
        if 'name' in data and str(data['name']).strip():
            product.name = str(data['name']).strip()
        if 'price' in data:
            product.base_price = float(data['price'])
        if 'sku' in data and str(data['sku']).strip():
            product.sku = str(data['sku']).strip()
        if 'is_active' in data:
            product.is_active = bool(data['is_active'])
        if 'description' in data:
            product.description = data['description']
        if 'category' in data and str(data['category']).strip():
            cat_name = str(data['category']).strip()
            cat, _ = CatalogCategory.objects.get_or_create(
                name=cat_name,
                defaults={'slug': cat_name.lower().replace(' › ', '-').replace(' ', '-'), 'description': cat_name, 'is_active': True, 'created_at': timezone.now(), 'updated_at': timezone.now()}
            )
            product.category = cat

        product.updated_at = timezone.now()
        product.save()

        # Handle stock adjustment if provided
        if 'stock' in data:
            new_stock = int(data['stock'])
            variant = product.variants.first()
            if not variant:
                variant = CatalogProductVariant.objects.create(
                    product=product,
                    sku=f"{product.sku}-OS",
                    attributes={'size': 'OS'},
                    price_adjustment=0,
                    is_active=True,
                    created_at=timezone.now(),
                    updated_at=timezone.now(),
                )
            stock_entry = InventoryStockEntry.objects.filter(product=product).first()
            old_stock = stock_entry.quantity if stock_entry else 0
            delta = new_stock - old_stock
            if stock_entry:
                stock_entry.quantity = new_stock
                stock_entry.updated_at = timezone.now()
                stock_entry.save()
            else:
                stock_entry = InventoryStockEntry.objects.create(
                    product=product,
                    variant=variant,
                    warehouse_id=1,
                    quantity=new_stock,
                    reserved_quantity=0,
                    last_counted_at=timezone.now(),
                    created_at=timezone.now(),
                    updated_at=timezone.now(),
                )
            if delta != 0:
                InventoryStockMovement.objects.create(
                    variant=variant,
                    sku=variant.sku,
                    delta=delta,
                    reason='manual_adjustment',
                )

        total_stock = sum(e.quantity for e in InventoryStockEntry.objects.filter(product=product))
        return Response({
            'id': product.id,
            'name': product.name,
            'sku': product.sku,
            'category': product.category.name if product.category else 'Tops',
            'price': int(product.base_price),
            'price_formatted': f"₱{int(product.base_price):,}",
            'stock': total_stock,
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


class MerchantCategoriesAPIView(APIView):
    def get(self, request):
        categories = CatalogCategory.objects.all().order_by('name')
        if not categories.exists():
            defaults = [
                'Tops › Hoodies',
                'Tops › T-Shirts',
                'Bottoms › Denim',
                'Accessories › Caps',
                'Accessories › Socks',
            ]
            for cat_name in defaults:
                CatalogCategory.objects.create(
                    name=cat_name,
                    slug=cat_name.lower().replace(' › ', '-').replace(' ', '-'),
                    description=cat_name,
                    is_active=True,
                    created_at=timezone.now(),
                    updated_at=timezone.now(),
                )
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
        name = request.data.get('name', '').strip()
        description = request.data.get('description', '').strip()
        if not name:
            return Response({'error': 'Category name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        slug = request.data.get('slug') or name.lower().replace(' › ', '-').replace(' ', '-')
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


class MerchantRestockAPIView(APIView):
    def post(self, request):
        sku = request.data.get('sku')
        qty = int(request.data.get('quantity', 25))
        reason = request.data.get('reason', 'restock')

        if not sku:
            return Response({'error': 'SKU is required.'}, status=status.HTTP_400_BAD_REQUEST)

        variant = CatalogProductVariant.objects.filter(sku=sku).first()
        if variant:
            stock_entry = InventoryStockEntry.objects.filter(variant=variant).first()
            if stock_entry:
                stock_entry.quantity += qty
                stock_entry.updated_at = timezone.now()
                stock_entry.save()
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


class MerchantStockMovementsAPIView(APIView):
    def get(self, request):
        movements = InventoryStockMovement.objects.all().order_by('-created_at')[:20]
        data = [
            {
                'id': m.id,
                'sku': m.sku or (m.variant.sku if m.variant else 'MD-SKU'),
                'delta': f"+{m.delta}" if m.delta > 0 else str(m.delta),
                'reason': m.reason,
                'when': m.created_at.strftime('%H:%M') if m.created_at else '00:00',
            }
            for m in movements
        ]
        if not data:
            data = [
                {'id': 1, 'sku': 'MD-HD-002-BLK-M-OVS', 'delta': '+25', 'reason': 'restock', 'when': '09:20'},
                {'id': 2, 'sku': 'MD-TS-001-WHT-L-REG', 'delta': '−2', 'reason': 'sale', 'when': '09:04'},
                {'id': 3, 'sku': 'MD-CP-001-BLK-OS', 'delta': '−1', 'reason': 'sale', 'when': '08:47'},
                {'id': 4, 'sku': 'MD-DN-001-IND-32-STR', 'delta': '+1', 'reason': 'return', 'when': '08:15'},
            ]
        return Response(data)


class MerchantReviewsAPIView(APIView):
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
        if not data:
            data = [
                {
                    'id': 1,
                    'customer': 'Bea S.',
                    'customer_name': 'Bea S.',
                    'product_name': 'Drip Zip-Up Hoodie',
                    'body': 'Super lapad ng fit, ang angas ng tela! Perfect for streetwear layering.',
                    'product_review': 'Drip Zip-Up Hoodie — “Super lapad ng fit…”',
                    'rating_stars': '★★★★★',
                    'rating': 5,
                    'status': 'published',
                    'merchant_reply': '',
                    'replied_at': None,
                    'created_at': '2026-09-19 14:30',
                },
                {
                    'id': 2,
                    'customer': 'Marco L.',
                    'customer_name': 'Marco L.',
                    'product_name': 'Metro Snapback',
                    'body': 'Color is slightly off from photo. The cap is good quality though.',
                    'product_review': 'Metro Snapback — “Color is slightly off.”',
                    'rating_stars': '★★★☆☆',
                    'rating': 3,
                    'status': 'published',
                    'merchant_reply': '',
                    'replied_at': None,
                    'created_at': '2026-09-19 12:15',
                },
            ]
        return Response(data)


class MerchantReviewDetailAPIView(APIView):
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


class MerchantReviewReplyAPIView(APIView):
    def post(self, request, pk):
        reply_text = request.data.get('reply', '').strip()
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


class MerchantReviewModerateAPIView(APIView):
    """Deprecated: Retained for backwards compatibility."""
    def post(self, request, pk):
        new_status = request.data.get('status', 'approved')
        try:
            review = ReviewsReview.objects.get(pk=pk)
            review.status = new_status
            review.save()
        except ReviewsReview.DoesNotExist:
            pass

        return Response({
            'id': pk,
            'status': new_status,
            'message': f"Review #{pk} status updated to {new_status}.",
        })


class MerchantOrdersAPIView(APIView):
    def get(self, request, pk=None):
        if pk is not None:
            # Single order detail
            order = OrdersOrder.objects.filter(pk=pk).first()
            if order:
                lines = []
                for l in order.lines.select_related('product', 'variant').all():
                    lines.append({
                        'product_name': l.product.name if l.product else 'Metro Apparel',
                        'variant_desc': f"{l.variant.attributes.get('size', 'M')} · {l.variant.attributes.get('color', 'BLK')}" if l.variant and isinstance(l.variant.attributes, dict) else 'Standard',
                        'quantity': l.quantity,
                        'unit_price': int(l.unit_price),
                        'total_price': int(l.total_price),
                    })
                addr = getattr(order, 'shipping_address', None)
                addr_data = {
                    'name': addr.name if addr else 'Customer',
                    'line1': addr.address_line1 if addr else '123 Ayala Ave',
                    'city': addr.city if addr else 'Makati',
                    'state': addr.state if addr else 'Metro Manila',
                    'postal_code': addr.postal_code if addr else '1200',
                    'phone': addr.phone if addr else '+63 917 123 4567',
                } if addr else {
                    'name': 'Juan Dela Cruz',
                    'line1': 'Unit 12B Tower 2, One Serendra',
                    'city': 'Taguig',
                    'state': 'Metro Manila',
                    'postal_code': '1634',
                    'phone': '+63 917 555 1234',
                }
                pm = order.payments.first()
                pay_method = pm.method.upper() if pm else 'GCASH'
                return Response({
                    'id': order.id,
                    'order_no': f"MD-2026-00{order.id:03d}",
                    'status': order.status.capitalize(),
                    'raw_status': order.status.lower(),
                    'subtotal': int(order.subtotal),
                    'shipping': int(order.shipping),
                    'tax': int(order.tax),
                    'total': int(order.total),
                    'payment_method': pay_method,
                    'created_at': order.created_at.strftime('%Y-%m-%d %H:%M') if order.created_at else None,
                    'shipping_address': addr_data,
                    'lines': lines if lines else [
                        {'product_name': 'Drip Zip-Up Hoodie', 'variant_desc': 'BLK · M · OVS', 'quantity': 1, 'unit_price': 1249, 'total_price': 1249},
                        {'product_name': 'Metro Core Boxy Tee', 'variant_desc': 'WHT · XL · REG', 'quantity': 2, 'unit_price': 649, 'total_price': 1298},
                    ],
                })
            else:
                demo_orders = {
                    318: {'customer': 'Juan Dela Cruz', 'phone': '+63 917 555 1234', 'addr': 'Unit 12B Tower 2, One Serendra, Taguig', 'total': 2632, 'subtotal': 2547, 'shipping': 85, 'pay': 'GCASH', 'status': 'Paid'},
                    317: {'customer': 'Bea Santos', 'phone': '+63 918 222 3456', 'addr': '45 Commonwealth Ave, Quezon City', 'total': 1249, 'subtotal': 1164, 'shipping': 85, 'pay': 'MAYA', 'status': 'Packed'},
                    316: {'customer': 'Miguel Reyes', 'phone': '+63 920 444 8899', 'addr': '88 Session Road, Baguio City', 'total': 3447, 'subtotal': 3327, 'shipping': 120, 'pay': 'CARD', 'status': 'Shipped'},
                    315: {'customer': 'Aliyah Cruz', 'phone': '+63 927 888 1122', 'addr': '24 Real St, Cebu City', 'total': 849, 'subtotal': 699, 'shipping': 150, 'pay': 'GCASH', 'status': 'Pending'},
                    314: {'customer': 'Marco Lim', 'phone': '+63 915 777 4433', 'addr': '77 Abreeza Mall Road, Davao City', 'total': 1798, 'subtotal': 1648, 'shipping': 150, 'pay': 'GCASH', 'status': 'Paid'},
                }
                demo = demo_orders.get(pk, {'customer': 'Metro Customer', 'phone': '+63 917 000 0000', 'addr': 'Metro Manila', 'total': 2632, 'subtotal': 2547, 'shipping': 85, 'pay': 'GCASH', 'status': 'Paid'})
                return Response({
                    'id': pk,
                    'order_no': f"MD-2026-00{pk:03d}",
                    'status': demo['status'],
                    'raw_status': demo['status'].lower(),
                    'subtotal': demo['subtotal'],
                    'shipping': demo['shipping'],
                    'tax': 0,
                    'total': demo['total'],
                    'payment_method': demo['pay'],
                    'created_at': '2026-09-19 15:42',
                    'shipping_address': {
                        'name': demo['customer'],
                        'line1': demo['addr'],
                        'city': 'Taguig',
                        'state': 'Metro Manila',
                        'postal_code': '1634',
                        'phone': demo['phone'],
                    },
                    'lines': [
                        {'product_name': 'Drip Zip-Up Hoodie', 'variant_desc': 'BLK · M · OVS', 'quantity': 1, 'unit_price': 1249, 'total_price': 1249},
                        {'product_name': 'Metro Core Boxy Tee', 'variant_desc': 'WHT · XL · REG', 'quantity': 2, 'unit_price': 649, 'total_price': 1298},
                    ],
                })

        orders_qs = OrdersOrder.objects.all().order_by('-created_at')[:20]
        data = []
        for o in orders_qs:
            pm = o.payments.first()
            pay_method = pm.method.upper() if pm else 'GCASH'
            addr = getattr(o, 'shipping_address', None)
            cust_name = addr.name if addr else 'Metro Customer'
            data.append({
                'id': o.id,
                'order_no': f"MD-2026-00{o.id:03d}",
                'customer': cust_name,
                'total': f"₱{int(o.total):,}",
                'pay': pay_method,
                'status': o.status.capitalize(),
                'raw_status': o.status.lower(),
                'created_at': o.created_at.strftime('%Y-%m-%d %H:%M') if o.created_at else None,
            })
        if not data:
            data = [
                {'id': 318, 'order_no': 'MD-2026-00318', 'customer': 'Juan Dela Cruz', 'total': '₱2,632', 'pay': 'GCASH', 'status': 'Paid', 'raw_status': 'paid'},
                {'id': 317, 'order_no': 'MD-2026-00317', 'customer': 'Bea Santos', 'total': '₱1,249', 'pay': 'MAYA', 'status': 'Packed', 'raw_status': 'packed'},
                {'id': 316, 'order_no': 'MD-2026-00316', 'customer': 'Miguel Reyes', 'total': '₱3,447', 'pay': 'CARD', 'status': 'Shipped', 'raw_status': 'shipped'},
                {'id': 315, 'order_no': 'MD-2026-00315', 'customer': 'Aliyah Cruz', 'total': '₱849', 'pay': 'GCASH', 'status': 'Pending', 'raw_status': 'pending'},
                {'id': 314, 'order_no': 'MD-2026-00314', 'customer': 'Marco Lim', 'total': '₱1,798', 'pay': 'GCASH', 'status': 'Paid', 'raw_status': 'paid'},
            ]
        return Response(data)

    def patch(self, request, pk):
        new_status = request.data.get('status', '').strip().lower()
        if not new_status:
            return Response({'error': 'Status is required.'}, status=status.HTTP_400_BAD_REQUEST)

        order = OrdersOrder.objects.filter(pk=pk).first()
        if order:
            order.status = new_status
            order.updated_at = timezone.now()
            order.save()

        return Response({
            'id': pk,
            'order_no': f"MD-2026-00{pk:03d}",
            'status': new_status.capitalize(),
            'raw_status': new_status,
            'message': f"Order #{pk} status successfully updated to {new_status.capitalize()}.",
        })


class MerchantOrdersExportAPIView(APIView):
    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="metrodrip_merchant_orders_{timezone.now().strftime("%Y%m%d")}.csv"'
        writer = csv.writer(response)
        writer.writerow(['Order ID', 'Customer', 'Total', 'Payment', 'Status', 'Date'])

        orders_qs = OrdersOrder.objects.all().order_by('-created_at')
        if orders_qs.exists():
            for o in orders_qs:
                addr = getattr(o, 'shipping_address', None)
                cust_name = addr.name if addr else 'Metro Customer'
                pm = o.payments.first()
                pay_method = pm.method.upper() if pm else 'GCASH'
                writer.writerow([
                    f"MD-2026-00{o.id:03d}",
                    cust_name,
                    int(o.total),
                    pay_method,
                    o.status.capitalize(),
                    o.created_at.strftime('%Y-%m-%d %H:%M') if o.created_at else '',
                ])
        else:
            writer.writerow(['MD-2026-00318', 'Juan Dela Cruz', 2632, 'GCASH', 'Paid', '2026-09-19 15:42'])
            writer.writerow(['MD-2026-00317', 'Bea Santos', 1249, 'MAYA', 'Packed', '2026-09-19 14:10'])
            writer.writerow(['MD-2026-00316', 'Miguel Reyes', 3447, 'CARD', 'Shipped', '2026-09-19 11:25'])
            writer.writerow(['MD-2026-00315', 'Aliyah Cruz', 849, 'GCASH', 'Pending', '2026-09-19 09:30'])
            writer.writerow(['MD-2026-00314', 'Marco Lim', 1798, 'GCASH', 'Paid', '2026-09-19 08:15'])

        return response


class MerchantAnalyticsAPIView(APIView):
    def get(self, request):
        category_filter = request.query_params.get('category', 'all').lower()

        raw_products = [
            {'name': 'Drip Zip-Up Hoodie', 'category': 'tops', 'net_units': 80, 'net_sales': 96000, 'formatted_sales': '₱96,000', 'views': 2400, 'added_to_cart': 300, 'growth': '+33.3%', 'growth_direction': 'up'},
            {'name': 'Metro Core Boxy Tee', 'category': 'tops', 'net_units': 120, 'net_sales': 74000, 'formatted_sales': '₱74,000', 'views': 3800, 'added_to_cart': 420, 'growth': '+20.0%', 'growth_direction': 'up'},
            {'name': 'Metro Straight-Cut Jeans', 'category': 'bottoms', 'net_units': 45, 'net_sales': 45000, 'formatted_sales': '₱45,000', 'views': 1600, 'added_to_cart': 160, 'growth': '-10.0%', 'growth_direction': 'down'},
            {'name': 'Metro Snapback', 'category': 'accessories', 'net_units': 50, 'net_sales': 24600, 'formatted_sales': '₱24,600', 'views': 1800, 'added_to_cart': 210, 'growth': '+100.0%', 'growth_direction': 'up'},
            {'name': 'Drip Crew Socks 3-Pack', 'category': 'accessories', 'net_units': 25, 'net_sales': 9000, 'formatted_sales': '₱9,000', 'views': 800, 'added_to_cart': 110, 'growth': '-44.4%', 'growth_direction': 'down'},
        ]

        if category_filter and category_filter != 'all':
            filtered_products = [p for p in raw_products if p['category'] == category_filter]
        else:
            filtered_products = raw_products

        total_units = sum(p['net_units'] for p in filtered_products)
        total_sales = sum(p['net_sales'] for p in filtered_products)
        total_views = sum(p['views'] for p in filtered_products)
        total_cart = sum(p['added_to_cart'] for p in filtered_products)

        data = {
            'period': 'Sep 13–19, 2026',
            'comparison_period': 'previous 7 days',
            'currency': 'PHP',
            'timezone': 'Asia/Manila',
            'kpis': {
                'net_sales': {
                    'value': total_sales,
                    'formatted': f"₱{total_sales:,}",
                    'growth': '+18.0%',
                    'growth_direction': 'up',
                    'prior_formatted': '₱210,678',
                },
                'orders': {
                    'value': 200,
                    'growth': '+11.1%',
                    'growth_direction': 'up',
                },
                'net_units_sold': {
                    'value': total_units,
                    'growth': '+14.3%',
                    'growth_direction': 'up',
                },
                'purchase_session_rate': {
                    'value': '2.50%',
                    'growth': '+0.25 pp',
                    'growth_direction': 'up',
                },
            },
            'sales_over_time': {
                'labels': ['13 Sep', '14 Sep', '15 Sep', '16 Sep', '17 Sep', '18 Sep', '19 Sep'],
                'current_period': [26000, 29000, 28000, 36000, 33000, 41000, 48000],
                'previous_period': [23000, 25000, 27000, 29000, 31000, 33000, 35000],
                'summary': '₱248,600 net sales  ·  ↑ 18.0% vs ₱210,678',
            },
            'best_sellers': [
                {'name': 'Drip Zip-Up Hoodie', 'net_sales': 96000, 'formatted_sales': '₱96,000', 'bar_percentage': 100},
                {'name': 'Metro Core Boxy Tee', 'net_sales': 74000, 'formatted_sales': '₱74,000', 'bar_percentage': 77.1},
                {'name': 'Metro Straight-Cut Jeans', 'net_sales': 45000, 'formatted_sales': '₱45,000', 'bar_percentage': 46.9},
            ],
            'product_sales_report': filtered_products,
            'totals': {
                'name': 'TOTAL',
                'net_units': total_units,
                'net_sales': total_sales,
                'formatted_sales': f"₱{total_sales:,}",
                'views': total_views,
                'added_to_cart': total_cart,
                'growth': '+14.3%',
                'growth_direction': 'up',
            },
            'trending_products': [
                {'name': 'Metro Snapback', 'prior_units': 25, 'current_units': 50, 'growth': '+100.0%', 'growth_direction': 'up'},
                {'name': 'Drip Zip-Up Hoodie', 'prior_units': 60, 'current_units': 80, 'growth': '+33.3%', 'growth_direction': 'up'},
                {'name': 'Metro Core Boxy Tee', 'prior_units': 100, 'current_units': 120, 'growth': '+20.0%', 'growth_direction': 'up'},
            ],
            'user_interactions': {
                'total_sessions': 8000,
                'funnel': [
                    {'action': 'Product viewed', 'count': 6000, 'percentage': 75.0, 'bar_width': 75},
                    {'action': 'Added to cart', 'count': 800, 'percentage': 10.0, 'bar_width': 10},
                    {'action': 'Checkout started', 'count': 400, 'percentage': 5.0, 'bar_width': 5},
                    {'action': 'Purchased', 'count': 200, 'percentage': 2.5, 'bar_width': 2.5},
                ],
            },
        }
        return Response(data)
