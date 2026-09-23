from django.db import models


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
    description = models.TextField()
    is_active = models.BooleanField()

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

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


class CatalogProduct(models.Model):
    id = models.BigAutoField(primary_key=True)

    sku = models.CharField(
        max_length=50,
        unique=True
    )

    name = models.CharField(max_length=255)
    description = models.TextField()
    image_url = models.CharField(max_length=500, blank=True, null=True)
    category = models.ForeignKey(
        CatalogCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='category_id',
        related_name='products'
    )

    base_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    currency = models.CharField(
        max_length=3,
        default='USD'
    )

    is_active = models.BooleanField()
    is_featured = models.BooleanField()

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'catalog_product'
        indexes = [
            models.Index(fields=['category', 'is_active']),
        ]


class CatalogColor(models.Model):
    id = models.BigAutoField(primary_key=True)

    name = models.CharField(max_length=100)
    hex_code = models.CharField(max_length=7)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'catalog_color'
        constraints = [
            models.UniqueConstraint(
                fields=['name'],
                name='uniq_catalog_color_name'
            ),
            models.UniqueConstraint(
                fields=['hex_code'],
                name='uniq_catalog_color_hex'
            ),
        ]


class CatalogProductVariant(models.Model):
    id = models.BigAutoField(primary_key=True)

    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='variants'
    )

    sku = models.CharField(
        max_length=50,
        unique=True
    )

    color = models.ForeignKey(
        CatalogColor,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        db_column='color_id',
        related_name='variants'
    )

    attributes = models.JSONField()

    price_adjustment = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    is_active = models.BooleanField()

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'catalog_product_variant'


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

    warehouse_id = models.BigIntegerField()
    quantity = models.PositiveIntegerField()
    reserved_quantity = models.PositiveIntegerField(default=0)

    last_counted_at = models.DateTimeField()

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'inventory_stockentry'
        constraints = [
            models.UniqueConstraint(
                fields=[
                    'product',
                    'variant',
                    'warehouse_id'
                ],
                name='uniq_stock_product_variant_warehouse'
            ),
        ]


class InventoryReservation(models.Model):
    id = models.BigAutoField(primary_key=True)

    order_id = models.BigIntegerField()

    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='reservations'
    )

    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='variant_id',
        related_name='reservations'
    )

    quantity = models.PositiveIntegerField()
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'inventory_reservation'
        indexes = [
            models.Index(fields=['expires_at']),
        ]


class InventoryIdempotencyRecord(models.Model):
    id = models.BigAutoField(primary_key=True)

    token = models.CharField(
        max_length=64,
        unique=True
    )

    action = models.CharField(max_length=50)
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'inventory_idempotencyrecord'


class InventoryStockEvent(models.Model):
    id = models.BigAutoField(primary_key=True)

    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='stock_events'
    )

    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='variant_id',
        related_name='stock_events'
    )

    warehouse_id = models.BigIntegerField()
    quantity_change = models.IntegerField()

    reference_type = models.CharField(max_length=50)
    reference_id = models.CharField(max_length=100)
    created_by = models.BigIntegerField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'inventory_stockevent'
        indexes = [
            models.Index(fields=['product', 'created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=[
                    'product',
                    'variant',
                    'warehouse_id',
                    'created_at'
                ],
                name='uniq_stockevent_product_variant_warehouse_created'
            ),
        ]


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
    reason = models.CharField(max_length=20)  # restock, sale, return, adjustment
    ref_order_ref = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_stockmovement'
        ordering = ['-created_at']


