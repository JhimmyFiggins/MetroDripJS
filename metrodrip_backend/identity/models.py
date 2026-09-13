from django.db import models


class AccountsCustomer(models.Model):
    id = models.BigAutoField(primary_key=True)
    password = models.CharField(max_length=128)
    last_login = models.DateTimeField(null=True, blank=True)
    is_superuser = models.BooleanField()
    email = models.EmailField(max_length=254, unique=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=32)
    addresses = models.JSONField()
    is_active = models.BooleanField()
    is_staff = models.BooleanField()
    role = models.CharField(max_length=16, db_index=True)
    date_joined = models.DateTimeField()

    class Meta:
        db_table = 'accounts_customer'


class AccountsWishlistItem(models.Model):
    id = models.BigAutoField(primary_key=True)

    customer = models.ForeignKey(
        AccountsCustomer,
        on_delete=models.CASCADE,
        db_column='customer_id',
        related_name='wishlist_items'
    )

    product_ref = models.BigIntegerField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'accounts_wishlistitem'
        constraints = [
            models.UniqueConstraint(
                fields=['customer', 'product_ref'],
                name='uniq_wishlist_entry'
            ),
        ]


class CoreServiceEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    target_model = models.CharField(max_length=100)
    target_field = models.CharField(max_length=100)
    reference_id = models.CharField(max_length=100)
    operation = models.CharField(max_length=8)
    created_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'core_serviceevent'
        indexes = [
            models.Index(fields=['completed_at']),
        ]