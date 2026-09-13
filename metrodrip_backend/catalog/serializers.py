from rest_framework import serializers
from .models import CatalogProduct, CatalogCategory

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogProduct
        fields = [
            'id',
            'sku',
            'name',
            'description',
            'image_url',
            'category',
            'base_price',
            'currency',
            'is_active',
            'is_featured',
            'created_at',
            'updated_at',
        ]

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogCategory
        fields = [
            'id',
            'name',
            'slug',
            'description',
            'is_active',
            'created_at',
            'updated_at',
        ]