from rest_framework import serializers
from .models import CatalogProduct

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogProduct
        fields = ['id', 'name', 'slug', 'description', 'base_price', 'is_active', 'created_at']