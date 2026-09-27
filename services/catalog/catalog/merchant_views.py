from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    CatalogColor,
    InventoryStockEntry,
    InventoryStockMovement,
)

class MerchantDashboardCatalogSliceAPIView(APIView):
    def get(self, request):
        low_stock_entries = InventoryStockEntry.objects.filter(quantity__lte=5).select_related('product', 'variant')
        low_stock_count = low_stock_entries.count()

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

        return Response({
            'low_stock_skus': low_stock_count,
            'low_stock_alerts': low_stock_alerts,
            'total_products': CatalogProduct.objects.count(),
            'total_variants': CatalogProductVariant.objects.count(),
        })

class MerchantProductsAPIView(APIView):
    def get(self, request, pk=None):
        if pk is not None:
            p = CatalogProduct.objects.filter(pk=pk).first()
            if not p:
                return Response({'error': 'Product not found.'}, status=404)
            variants = []
            for v in p.variants.all():
                stock = InventoryStockEntry.objects.filter(variant=v).first()
                variants.append({
                    'id': v.id,
                    'sku': v.sku,
                    'attributes': v.attributes,
                    'price_adjustment': v.price_adjustment,
                    'stock': stock.quantity if stock else 0,
                })
            return Response({
                'id': p.id,
                'sku': p.sku,
                'name': p.name,
                'description': p.description,
                'base_price': p.base_price,
                'image_url': p.image_url,
                'is_active': p.is_active,
                'variants': variants,
            })

        products = CatalogProduct.objects.all().order_by('-created_at')[:50]
        data = []
        for p in products:
            total_stock = sum(s.quantity for s in InventoryStockEntry.objects.filter(product=p))
            data.append({
                'id': p.id,
                'sku': p.sku,
                'name': p.name,
                'base_price': p.base_price,
                'stock': total_stock,
                'is_active': p.is_active,
            })
        return Response(data)

    def post(self, request):
        name = request.data.get('name', '').strip()
        sku = request.data.get('sku', '').strip()
        base_price = request.data.get('base_price', 0)
        description = request.data.get('description', '').strip()
        image_url = request.data.get('image_url', '').strip()
        category_id = request.data.get('category_id')

        if not name or not sku:
            return Response({'error': 'Name and SKU are required.'}, status=400)

        if CatalogProduct.objects.filter(sku=sku).exists():
            return Response({'error': 'Product with this SKU already exists.'}, status=400)

        p = CatalogProduct.objects.create(
            name=name,
            sku=sku,
            base_price=int(base_price),
            description=description,
            image_url=image_url,
            category_id=category_id,
            is_active=True,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        return Response({
            'id': p.id,
            'name': p.name,
            'sku': p.sku,
            'base_price': p.base_price,
        }, status=status.HTTP_201_CREATED)
