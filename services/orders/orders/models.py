from django.db import models
from django.utils import timezone


class OrdersOrder(models.Model):
    id = models.BigAutoField(primary_key=True)
    order_no = models.CharField(max_length=32, unique=True, db_index=True)
    customer_ref = models.BigIntegerField(null=True, blank=True, db_index=True)
    # 'pending_stock_confirmation', 'placed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'
    status = models.CharField(max_length=32, default='pending_stock_confirmation', db_index=True)
    subtotal = models.IntegerField(default=0)
    shipping = models.IntegerField(default=0)
    tax = models.IntegerField(default=0)
    discount = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    currency = models.CharField(max_length=3, default='PHP')
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'orders_order'
        ordering = ['-created_at']

    def __str__(self):
        return self.order_no


class OrdersOrderLine(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='lines'
    )
    product_ref = models.BigIntegerField(db_index=True)
    variant_ref = models.BigIntegerField(db_index=True)
    sku_snapshot = models.CharField(max_length=64, default='')
    product_name_snapshot = models.CharField(max_length=255, default='')
    variant_desc_snapshot = models.CharField(max_length=255, blank=True, default='')
    quantity = models.PositiveIntegerField()
    unit_price = models.IntegerField(default=0)
    total_price = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'orders_orderline'


class OrdersShippingAddress(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.OneToOneField(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='shipping_address'
    )
    name = models.CharField(max_length=150)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    country = models.CharField(max_length=2, default='PH')
    phone = models.CharField(max_length=32)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'orders_shippingaddress'


class OrdersPayment(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='payments'
    )
    method = models.CharField(max_length=30)  # 'cod', 'gcash', 'maya', 'card'
    status = models.CharField(max_length=20, default='pending_collection')  # 'pending_collection', 'paid', 'failed'
    amount = models.IntegerField(default=0)
    currency = models.CharField(max_length=3, default='PHP')
    provider_ref = models.CharField(max_length=100, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'orders_payment'


class OrdersStockHold(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='stock_holds'
    )
    checkout_id = models.CharField(max_length=64, unique=True, db_index=True)
    state = models.CharField(max_length=16, default='active')  # 'active', 'committed', 'released', 'cancelled'
    expires_at = models.DateTimeField(db_index=True)
    committed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'orders_stockhold'


class OrdersOutboxMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    topic = models.CharField(max_length=48)
    payload = models.JSONField()
    state = models.CharField(max_length=16, default='pending', db_index=True)  # 'pending', 'sent', 'failed'
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now, db_index=True)
    correlation_id = models.CharField(max_length=128, null=True, blank=True)
    last_error = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'orders_outboxmessage'


class ReviewsReview(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_name = models.CharField(max_length=150)
    product_name = models.CharField(max_length=255)
    customer_ref = models.BigIntegerField(null=True, blank=True, db_index=True)
    product_ref = models.BigIntegerField(null=True, blank=True, db_index=True)
    order_id = models.BigIntegerField(null=True, blank=True)
    rating = models.PositiveSmallIntegerField(default=5)
    body = models.TextField()
    merchant_reply = models.TextField(blank=True, default='')
    replied_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, default='pending')  # pending, approved, rejected
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reviews_review'
        ordering = ['-created_at']


class OrdersIdempotencyRecord(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    order = models.ForeignKey(OrdersOrder, on_delete=models.CASCADE)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'orders_idempotencyrecord'
