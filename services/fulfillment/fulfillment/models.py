from django.db import models
from django.utils import timezone


class ShippingShippingZone(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    fee = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'shipping_shippingzone'

    def __str__(self):
        return f"{self.name} (₱{self.fee})"


class ShippingShipment(models.Model):
    id = models.BigAutoField(primary_key=True)
    order_ref = models.BigIntegerField(unique=True, db_index=True)
    counter = models.PositiveIntegerField(default=1)
    courier = models.CharField(max_length=64, default='J&T Express')
    waybill_no = models.CharField(max_length=64)
    tracking_no = models.CharField(max_length=255)
    status = models.CharField(max_length=20, default='pending')
    booked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'shipping_shipment'


class NotificationsDeviceToken(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_ref = models.BigIntegerField(db_index=True)
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10)
    created_at = models.DateTimeField(default=timezone.now)
    last_seen_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'notifications_devicetoken'


class NotificationsNotification(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_ref = models.BigIntegerField(db_index=True)
    title = models.CharField(max_length=140)
    body = models.TextField()
    category = models.CharField(max_length=50)  # 'order', 'drop', 'payment', 'review', 'stock'
    order_ref = models.BigIntegerField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'notifications_notification'
        indexes = [
            models.Index(fields=['is_read']),
            models.Index(fields=['customer_ref', 'is_read']),
        ]
