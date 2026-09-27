from django.db import models
from django.utils import timezone


class CatalogCategory(models.Model):
    id = models.BigAutoField(primary_key=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        db_column='parent_id',
        related_name='children'
    )
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=150)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'catalog_category'
        constraints = [
            models.UniqueConstraint(
                fields=['parent', 'slug'],
                name='uniq_category_parent_slug'
            ),
        ]
        indexes = [
            models.Index(fields=['slug']),
        ]

    def __str__(self):
        return self.name


class CatalogColor(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100)
    hex_code = models.CharField(max_length=7)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'catalog_color'
        constraints = [
            models.UniqueConstraint(fields=['name'], name='uniq_catalog_color_name'),
            models.UniqueConstraint(fields=['hex_code'], name='uniq_catalog_color_hex'),
        ]


class CatalogProduct(models.Model):
    id = models.BigAutoField(primary_key=True)
    sku = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    image_url = models.CharField(max_length=500, blank=True, null=True)
    category = models.ForeignKey(
        CatalogCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='category_id',
        related_name='products'
    )
    # Integer whole PHP pesos
    base_price = models.IntegerField(default=0)
    currency = models.CharField(max_length=3, default='PHP')
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'catalog_product'
        indexes = [
            models.Index(fields=['category', 'is_active']),
        ]

    def __str__(self):
        return self.name


class CatalogProductVariant(models.Model):
    id = models.BigAutoField(primary_key=True)
    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='variants'
    )
    sku = models.CharField(max_length=50, unique=True)
    color = models.ForeignKey(
        CatalogColor,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        db_column='color_id',
        related_name='variants'
    )
    attributes = models.JSONField(default=dict)
    # Integer whole PHP pesos price adjustment
    price_adjustment = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'catalog_product_variant'

    @property
    def final_price(self):
        return max(0, self.product.base_price + self.price_adjustment)


class InventoryStockEntry(models.Model):
    id = models.BigAutoField(primary_key=True)
    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='stock_entries'
    )
    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='variant_id',
        related_name='stock_entries'
    )
    warehouse_id = models.BigIntegerField(default=1)
    quantity = models.PositiveIntegerField(default=0)
    reserved_quantity = models.PositiveIntegerField(default=0)
    last_counted_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'inventory_stockentry'
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'variant', 'warehouse_id'],
                name='uniq_stock_product_variant_warehouse'
            ),
        ]

    @property
    def available_quantity(self):
        return max(0, self.quantity - self.reserved_quantity)


class InventoryReservation(models.Model):
    id = models.BigAutoField(primary_key=True)
    checkout_id = models.CharField(max_length=64, db_index=True)
    order_ref = models.BigIntegerField(null=True, blank=True)
    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='reservations'
    )
    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.CASCADE,
        db_column='variant_id',
        related_name='reservations'
    )
    quantity = models.PositiveIntegerField()
    # 'active', 'committed', 'released', 'expired'
    status = models.CharField(max_length=16, default='active', db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'inventory_reservation'
        indexes = [
            models.Index(fields=['checkout_id', 'status']),
            models.Index(fields=['expires_at', 'status']),
        ]


class InventoryIdempotencyRecord(models.Model):
    token = models.CharField(max_length=64, primary_key=True)
    action = models.CharField(max_length=50)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'inventory_idempotencyrecord'


class InventoryStockMovement(models.Model):
    id = models.BigAutoField(primary_key=True)
    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        db_column='variant_id',
        related_name='stock_movements'
    )
    sku = models.CharField(max_length=64, blank=True, null=True)
    delta = models.IntegerField()
    reason = models.CharField(max_length=20)  # restock, sale, reservation_hold, release, adjustment
    ref_order_ref = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_stockmovement'
        ordering = ['-created_at']
