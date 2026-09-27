import binascii
import os
from django.db import models
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone


class AccountsCustomer(models.Model):
    id = models.BigAutoField(primary_key=True)
    password = models.CharField(max_length=128)
    last_login = models.DateTimeField(null=True, blank=True)
    is_superuser = models.BooleanField(default=False)
    email = models.EmailField(max_length=254, unique=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=32, blank=True, default='')
    addresses = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    role = models.CharField(max_length=16, db_index=True, default='customer')
    date_joined = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'accounts_customer'

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        """
        Verify password. If the stored password is legacy plaintext, verify
        and automatically upgrade to secure PBKDF2 hash.
        """
        if not raw_password:
            return False
        # Check if stored password has standard Django hash prefix
        if not (self.password.startswith('pbkdf2_') or self.password.startswith('argon2') or self.password.startswith('bcrypt')):
            if self.password == raw_password:
                self.set_password(raw_password)
                self.save(update_fields=['password'])
                return True
            return False
        return check_password(raw_password, self.password)


class AuthToken(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    customer = models.ForeignKey(
        AccountsCustomer,
        on_delete=models.CASCADE,
        related_name='auth_tokens'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'identity_authtoken'

    @classmethod
    def generate_key(cls):
        return binascii.hexlify(os.urandom(24)).decode()

    def save(self, *args, **kwargs):
        if not self.key:
            self.key = self.generate_key()
        return super().save(*args, **kwargs)


class AccountsWishlistItem(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer = models.ForeignKey(
        AccountsCustomer,
        on_delete=models.CASCADE,
        db_column='customer_id',
        related_name='wishlist_items'
    )
    product_ref = models.BigIntegerField(db_index=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'accounts_wishlistitem'
        constraints = [
            models.UniqueConstraint(
                fields=['customer', 'product_ref'],
                name='uniq_wishlist_entry'
            ),
        ]


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    actor = models.CharField(max_length=150)
    actor_role = models.CharField(max_length=50, default='admin')
    action = models.CharField(max_length=255)
    target_model = models.CharField(max_length=100, blank=True, null=True)
    target_id = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'identity_auditlog'
        ordering = ['-created_at']


class CoreServiceEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    target_model = models.CharField(max_length=100)
    target_field = models.CharField(max_length=100)
    reference_id = models.CharField(max_length=100)
    operation = models.CharField(max_length=8)
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'core_serviceevent'
