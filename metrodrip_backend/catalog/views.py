from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.renderers import JSONRenderer

from .models import CatalogProduct, CatalogCategory, CatalogProductVariant

from .serializers import (
    ProductSerializer,
    CategorySerializer,
    ProductVariantSerializer,
)


class ProductListAPIView(ListAPIView):
    queryset = CatalogProduct.objects.all()
    serializer_class = ProductSerializer
    renderer_classes = [JSONRenderer]


class ProductDetailAPIView(RetrieveAPIView):
    queryset = CatalogProduct.objects.all()
    serializer_class = ProductSerializer
    renderer_classes = [JSONRenderer]

class CategoryListAPIView(ListAPIView):
    queryset = CatalogCategory.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    renderer_classes = [JSONRenderer]

class ProductVariantListAPIView(ListAPIView):
    serializer_class = ProductVariantSerializer
    renderer_classes = [JSONRenderer]

    def get_queryset(self):
        return CatalogProductVariant.objects.filter(
            product_id=self.kwargs['product_id'],
            is_active=True
        )