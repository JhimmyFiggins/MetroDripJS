from django.db import models


class CatalogCategory(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='parent_id',
        related_name='children'
    )

    class Meta:
        db_table = 'catalog_category'


class CatalogProduct(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    description = models.TextField()

    category = models.ForeignKey(
        CatalogCategory,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        db_column='category_id',
        related_name='products'
    )

    base_price = models.PositiveIntegerField(default=0)
    images = models.JSONField()
    is_active = models.BooleanField()
    is_mock = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'catalog_product'

class CatalogProductVariant(models.Model):
    id = models.BigAutoField(primary_key=True)
    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='variants'
    )
    sku = models.CharField(max_length=64, unique=True)
    size = models.CharField(max_length=4)
    color = models.CharField(max_length=40)
    fit = models.CharField(max_length=10)
    price_override = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'catalog_productvariant'
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'size', 'color', 'fit'],
                name='uniq_variant_axes'
            ),
        ]

class InventoryStockRecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    variant = models.OneToOneField(
        CatalogProductVariant,
        on_delete=models.CASCADE,
        db_column='variant_id',
        related_name='stock_record'
    )
    qty_on_hand = models.IntegerField(default=0)
    qty_reserved = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=5)

    class Meta:
        db_table = 'inventory_stockrecord'

class InventoryReservation(models.Model):
    id = models.BigAutoField(primary_key=True)
    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.PROTECT,
        db_column='variant_id',
        related_name='reservations'
    )
    qty = models.IntegerField(default=0)
    status = models.CharField(max_length=9)
    session_key = models.CharField(max_length=64)
    checkout_id = models.CharField(max_length=64)
    order_ref = models.BigIntegerField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'inventory_reservation'

class InventoryIdempotencyRecord(models.Model):
    key_hash = models.CharField(max_length=64, primary_key=True)
    request_fingerprint = models.CharField(max_length=64)
    status_code = models.SmallIntegerField()
    response_body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_idempotencyrecord'

class InventoryStockMovement(models.Model):
    id = models.BigAutoField(primary_key=True)
    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.PROTECT,
        db_column='variant_id',
        related_name='stock_movements'
    )
    delta = models.IntegerField()
    reason = models.CharField(max_length=12)
    ref_order_ref = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_stockmovement'
class OrdersOrder(models.Model):
    id = models.BigAutoField(primary_key=True)
    order_no = models.CharField(max_length=20, unique=True)
    customer_ref = models.BigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, default='pending')
    subtotal = models.IntegerField(default=0)
    shipping_fee = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    shipping_address = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'orders_order'


class OrdersOrderItem(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='items'
    )
    variant_ref = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.PROTECT,
        db_column='variant_ref',
        related_name='order_items'
    )
    qty = models.IntegerField(default=1)
    unit_price_snapshot = models.IntegerField()
    product_ref = models.BigIntegerField()
    sku_snapshot = models.CharField(max_length=64)
    product_name_snapshot = models.CharField(max_length=200)
    product_slug_snapshot = models.CharField(max_length=220)
    size_snapshot = models.CharField(max_length=4)
    color_snapshot = models.CharField(max_length=40)
    fit_snapshot = models.CharField(max_length=10)
    image_url_snapshot = models.CharField(max_length=2048)
    snapshot_source = models.CharField(max_length=16, default='checkout')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'orders_orderitem'
        constraints = [
            models.UniqueConstraint(
                fields=['order', 'variant_ref'],
                name='uniq_order_variant'
            ),
        ]


class OrdersOrderNumberSequence(models.Model):
    id = models.BigAutoField(primary_key=True)
    year = models.IntegerField(unique=True)
    last_value = models.IntegerField(default=0)

    class Meta:
        db_table = 'orders_ordernumbersequence'


class OrdersStockHold(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='stock_holds'
    )
    checkout_id = models.CharField(max_length=64, unique=True)
    state = models.CharField(max_length=9, default='active')
    expires_at = models.DateTimeField()
    committed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'orders_stockhold'


class OrdersOutboxMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    topic = models.CharField(max_length=48)
    payload = models.JSONField()
    state = models.CharField(max_length=7, default='pending')
    attempts = models.SmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(auto_now_add=True)
    correlation_id = models.CharField(max_length=128, null=True, blank=True)
    last_error = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'orders_outboxmessage'


class PaymentsPayment(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.OneToOneField(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='payment'
    )
    provider_ref = models.CharField(max_length=128, unique=True, null=True, blank=True)
    method = models.CharField(max_length=8)
    status = models.CharField(max_length=10, default='pending')
    amount = models.IntegerField()
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'payments_payment'


class ShippingShippingZone(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=50, unique=True)
    fee = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'shipping_shippingzone'


class ShippingShipment(models.Model):
    id = models.BigAutoField(primary_key=True)
    order_ref = models.BigIntegerField(unique=True)
    courier = models.CharField(max_length=20)
    waybill_no = models.CharField(max_length=64)
    tracking_url = models.CharField(max_length=254, null=True, blank=True)
    status = models.CharField(max_length=20, default='pending')
    booked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'shipping_shipment'


class ReviewsReview(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_ref = models.BigIntegerField()
    product_ref = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_ref',
        related_name='reviews'
    )
    order_id = models.ForeignKey(
        OrdersOrder,
        on_delete=models.PROTECT,
        db_column='order_id',
        related_name='reviews'
    )
    rating = models.SmallIntegerField()
    body = models.TextField(default='')
    status = models.CharField(max_length=10, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reviews_review'
        constraints = [
            models.UniqueConstraint(
                fields=['customer_ref', 'product_ref'],
                name='uniq_customer_product'
            ),
        ]


class NotificationsDeviceToken(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_ref = models.BigIntegerField()
    token = models.CharField(max_length=200)
    platform = models.CharField(max_length=10)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications_devicetoken'
        constraints = [
            models.UniqueConstraint(
                fields=['token', 'platform'],
                name='uniq_token_platform'
            ),
        ]


class NotificationsNotification(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_ref = models.BigIntegerField()
    title = models.CharField(max_length=140)
    body = models.TextField()
    category = models.CharField(max_length=10)
    order_ref = models.BigIntegerField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications_notification'


class CmsHomepageBanner(models.Model):
    id = models.BigAutoField(primary_key=True)
    title = models.CharField(max_length=200)
    image_url = models.CharField(max_length=254)
    link_url = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    order = models.SmallIntegerField(default=0)

    class Meta:
        db_table = 'cms_homepagebanner'


class CmsContactMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=150)
    email = models.CharField(max_length=254)
    message = models.TextField()
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cms_contactmessage'