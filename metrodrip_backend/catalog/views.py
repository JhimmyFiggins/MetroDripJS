from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.renderers import JSONRenderer
from .models import CatalogProduct, CatalogCategory
from .serializers import ProductSerializer, CategorySerializer


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