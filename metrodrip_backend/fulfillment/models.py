from django.db import models


class ShippingShippingZone(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    fee = models.PositiveIntegerField()
    is_active = models.BooleanField()

    class Meta:
        db_table = 'shipping_shippingzone'


class ShippingShipment(models.Model):
    id = models.BigAutoField(primary_key=True)
    order_ref = models.BigIntegerField()
    counter = models.PositiveIntegerField()
    waybill_no = models.CharField(max_length=64)
    tracking_no = models.CharField(max_length=255)
    status = models.CharField(max_length=20)
    booked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'shipping_shipment'


class NotificationsDeviceToken(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_ref = models.BigIntegerField()
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10)
    created_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()

    class Meta:
        db_table = 'notifications_devicetoken'


class NotificationsNotification(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer_ref = models.BigIntegerField()
    title = models.CharField(max_length=140)
    body = models.TextField()
    category = models.CharField(max_length=50)
    order_ref = models.BigIntegerField(null=True, blank=True)
    is_read = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'notifications_notification'
        indexes = [
            models.Index(fields=['is_read']),
        ]