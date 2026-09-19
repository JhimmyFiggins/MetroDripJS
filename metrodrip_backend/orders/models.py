from django.db import models

from catalog.models import CatalogProduct, CatalogProductVariant


class OrdersOrder(models.Model):
    id = models.BigAutoField(primary_key=True)

    customer_id = models.BigIntegerField(null=True, blank=True)

    status = models.CharField(max_length=20)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    tax = models.DecimalField(max_digits=10, decimal_places=2)
    shipping = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    currency = models.CharField(max_length=3, default='USD')
    notes = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'orders_order'
        indexes = [
            models.Index(fields=['customer_id']),
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
        ]


class OrdersOrderLine(models.Model):
    id = models.BigAutoField(primary_key=True)

    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='lines'
    )

    product = models.ForeignKey(
        CatalogProduct,
        on_delete=models.CASCADE,
        db_column='product_id',
        related_name='order_lines'
    )

    variant = models.ForeignKey(
        CatalogProductVariant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='variant_id',
        related_name='order_lines'
    )

    quantity = models.PositiveIntegerField()

    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    total_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    discount_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    tax_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4
    )

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'orders_orderline'
        constraints = [
            models.UniqueConstraint(
                fields=['order', 'product', 'variant'],
                name='uniq_order_product_variant'
            ),
        ]


class OrdersOrderLineInventorySequence(models.Model):
    id = models.BigAutoField(primary_key=True)

    orderline = models.OneToOneField(
        OrdersOrderLine,
        on_delete=models.CASCADE,
        db_column='orderline_id',
        related_name='inventory_sequence'
    )

    next_sequence = models.PositiveIntegerField()

    created_at = models.DateTimeField()

    class Meta:
        db_table = 'orders_orderlineinventorysequence'


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
    address_line2 = models.CharField(
        max_length=255,
        null=True,
        blank=True
    )
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    country = models.CharField(max_length=2)
    phone = models.CharField(max_length=32)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'orders_shippingaddress'


class OrdersOrderMessage(models.Model):
    id = models.BigAutoField(primary_key=True)

    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='messages'
    )

    message = models.TextField()
    sender = models.CharField(max_length=100)
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'orders_ordermessage'


class OrdersPayment(models.Model):
    id = models.BigAutoField(primary_key=True)

    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='payments'
    )

    method = models.CharField(max_length=30)
    status = models.CharField(max_length=20)

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    currency = models.CharField(max_length=3)

    provider_ref = models.CharField(
        max_length=100,
        null=True,
        blank=True
    )

    metadata = models.JSONField()

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'orders_payment'
        indexes = [
            models.Index(fields=['order', 'status']),
        ]


class ServicesService(models.Model):
    id = models.BigAutoField(primary_key=True)

    order = models.ForeignKey(
        OrdersOrder,
        on_delete=models.CASCADE,
        db_column='order_id',
        related_name='services'
    )

    type = models.CharField(max_length=50)
    status = models.CharField(max_length=20)

    scheduled_at = models.DateTimeField(
        null=True,
        blank=True
    )

    completed_at = models.DateTimeField(
        null=True,
        blank=True
    )

    notes = models.TextField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        db_table = 'services_service'
        indexes = [
            models.Index(fields=['type']),
            models.Index(fields=['status']),
        ]


class ReviewsReview(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_name = models.CharField(max_length=150)
    product_name = models.CharField(max_length=255)
    customer_ref = models.BigIntegerField(null=True, blank=True)
    product_ref = models.BigIntegerField(null=True, blank=True)
    order_id = models.BigIntegerField(null=True, blank=True)
    rating = models.PositiveSmallIntegerField(default=5)
    body = models.TextField()
    status = models.CharField(max_length=10, default='pending')  # pending, approved, rejected
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reviews_review'
        ordering = ['-created_at']