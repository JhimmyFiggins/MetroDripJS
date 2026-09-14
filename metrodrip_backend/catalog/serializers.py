from rest_framework import serializers
from .models import CatalogProduct, CatalogCategory, CatalogProductVariant, InventoryStockEntry,

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

class ProductVariantSerializer(serializers.ModelSerializer):
    color_name = serializers.CharField(source='color.name', read_only=True)
    color_hex = serializers.CharField(source='color.hex_code', read_only=True)

    class Meta:
        model = CatalogProductVariant
        fields = [
            'id',
            'sku',
            'color',
            'color_name',
            'color_hex',
            'attributes',
            'price_adjustment',
            'is_active',
            'created_at',
            'updated_at',
        ]

class VariantStockSerializer(serializers.ModelSerializer):
    available_stock = serializers.SerializerMethodField()

    class Meta:
        model = InventoryStockEntry
        fields = [
            'id',
            'variant',
            'warehouse_id',
            'quantity',
            'reserved_quantity',
            'available_stock',
        ]

    def get_available_stock(self, obj):
        return obj.quantity - obj.reserved_quantity