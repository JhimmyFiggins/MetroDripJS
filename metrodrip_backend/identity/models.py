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
    password_change_required = models.BooleanField(default=False)

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

    def has_usable_password(self):
        return is_password_usable(self.password)


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


class PasswordResetToken(models.Model):
    id = models.BigAutoField(primary_key=True)
    customer = models.ForeignKey(
        AccountsCustomer,
        on_delete=models.CASCADE,
        related_name='password_reset_tokens',
    )
    token_digest = models.CharField(max_length=64, unique=True, db_index=True)
    token_prefix = models.CharField(max_length=12, db_index=True)
    purpose = models.CharField(max_length=32, default='reset')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    consumed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_by = models.ForeignKey(
        AccountsCustomer,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='issued_password_resets',
    )

    class Meta:
        db_table = 'identity_passwordresettoken'
        indexes = [
            models.Index(fields=['customer', 'expires_at']),
            models.Index(fields=['consumed_at']),
        ]

    @staticmethod
    def digest(raw_token):
        return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()

    @property
    def is_valid(self):
        return self.consumed_at is None and self.expires_at > timezone.now()

    @classmethod
    def issue(cls, customer, purpose='reset', lifetime_seconds=None, created_by=None):
        raw_token = secrets.token_urlsafe(32)
        ttl = lifetime_seconds or getattr(settings, 'PASSWORD_RESET_TOKEN_TTL_SECONDS', 1800)
        token = cls.objects.create(
            customer=customer,
            token_digest=cls.digest(raw_token),
            token_prefix=raw_token[:12],
            purpose=purpose,
            expires_at=timezone.now() + timedelta(seconds=ttl),
            created_by=created_by,
        )
        return token, raw_token


class RequestRateLimitBucket(models.Model):
    """A fixed-window counter shared by every application worker."""

    id = models.BigAutoField(primary_key=True)
    scope = models.CharField(max_length=64)
    identity_digest = models.CharField(max_length=64)
    window_started_at = models.DateTimeField()
    request_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'identity_request_ratelimit'
        constraints = [
            models.UniqueConstraint(
                fields=['scope', 'identity_digest'],
                name='uniq_rl_scope_identity',
            ),
        ]
        indexes = [
            models.Index(fields=['updated_at'], name='identity_rl_updated_idx'),
        ]


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


class PlatformSetting(models.Model):
    id = models.BigAutoField(primary_key=True)
    platform_name = models.CharField(max_length=150, default='MetroDrip')
    support_email = models.EmailField(max_length=254, default='support@metrodrip.ph')
    currency = models.CharField(max_length=16, default='PHP')
    timezone = models.CharField(max_length=64, default='Asia/Manila')
    language = models.CharField(max_length=16, default='en')
    date_format = models.CharField(max_length=32, default='YYYY-MM-DD')
    staff_mfa_policy = models.CharField(max_length=32, default='optional')
    session_timeout_minutes = models.CharField(max_length=16, default='60')
    customer_registration = models.CharField(max_length=16, default='enabled')
    maintenance_mode = models.CharField(max_length=16, default='off')
    order_confirmation_emails = models.CharField(max_length=16, default='enabled')
    sender_name = models.CharField(max_length=150, default='MetroDrip Orders')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'identity_platformsetting'

    @classmethod
    def get_instance(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class CustomRole(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=64, unique=True)
    title = models.CharField(max_length=100)
    base_role = models.CharField(max_length=32, default='merchant')
    description = models.TextField(blank=True, default='')
    permissions = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'identity_customrole'
        ordering = ['title']

