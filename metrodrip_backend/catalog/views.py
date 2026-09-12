# catalog/views.py
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer
from .models import CatalogProduct
from .serializers import ProductSerializer

class ProductListAPIView(ListAPIView):
    queryset = CatalogProduct.objects.all()
    serializer_class = ProductSerializer
    renderer_classes = [JSONRenderer]  # Add this line