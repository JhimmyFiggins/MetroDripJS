import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, identify_hasher, is_password_usable, make_password
from django.db import models
from django.utils import timezone


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

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        if not is_password_usable(self.password):
            return False
        try:
            identify_hasher(self.password)
        except ValueError:
            # Existing installs contain plaintext demo passwords. A successful
            # login upgrades them; new writes are always one-way hashes.
            return secrets.compare_digest(self.password, raw_password or '')
        return check_password(raw_password, self.password)


class CustomerAccessToken(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer = models.ForeignKey(
        AccountsCustomer,
        on_delete=models.CASCADE,
        related_name='access_tokens',
    )
    token_digest = models.CharField(max_length=64, unique=True)
    token_prefix = models.CharField(max_length=12, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = 'identity_customeraccesstoken'
        indexes = [
            models.Index(fields=['customer', 'expires_at']),
        ]

    @staticmethod
    def digest(raw_token):
        return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()

    @classmethod
    def issue(cls, customer, lifetime=None):
        raw_token = secrets.token_urlsafe(32)
        lifetime = lifetime or timedelta(
            seconds=getattr(settings, 'CUSTOMER_TOKEN_TTL_SECONDS', 2592000)
        )
        token = cls.objects.create(
            customer=customer,
            token_digest=cls.digest(raw_token),
            token_prefix=raw_token[:12],
            expires_at=timezone.now() + lifetime,
        )
        return token, raw_token


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
