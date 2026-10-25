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
    email_verified_at = models.DateTimeField(null=True, blank=True)

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


class EmailOtpChallenge(models.Model):
    PURPOSE_EMAIL_VERIFICATION = 'email_verification'
    PURPOSE_LOGIN_2FA = 'login_2fa'
    PURPOSES = (
        (PURPOSE_EMAIL_VERIFICATION, 'Email verification'),
        (PURPOSE_LOGIN_2FA, 'Login two-factor authentication'),
    )

    id = models.BigAutoField(primary_key=True)
    customer = models.ForeignKey(
        AccountsCustomer,
        on_delete=models.CASCADE,
        related_name='email_otp_challenges',
    )
    purpose = models.CharField(max_length=32)
    challenge_digest = models.CharField(max_length=64, unique=True)
    code_digest = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    sent_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)

    class Meta:
        db_table = 'identity_emailotpchallenge'
        indexes = [
            models.Index(fields=['customer', 'purpose', 'consumed_at']),
            models.Index(fields=['expires_at']),
        ]


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


def _default_payment_methods():
    # Hosted rails require both an operator allowlist and an intentional
    # merchant opt-in. New installations therefore start with COD only.
    return ['cod']


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
    registration_message = models.TextField(default='New customer registration is currently paused.')
    maintenance_mode = models.CharField(max_length=16, default='off')
    maintenance_message = models.TextField(default='MetroDrip is undergoing scheduled maintenance. Storefront access will resume shortly.')
    maintenance_scheduled_start = models.DateTimeField(null=True, blank=True)
    maintenance_scheduled_end = models.DateTimeField(null=True, blank=True)
    password_min_length = models.PositiveIntegerField(default=8)
    max_login_attempts = models.PositiveIntegerField(default=5)
    lockout_duration_minutes = models.PositiveIntegerField(default=15)
    admin_security_alerts = models.CharField(max_length=16, default='enabled')
    admin_alert_email = models.EmailField(max_length=254, default='security@metrodrip.ph')
    order_confirmation_emails = models.CharField(max_length=16, default='enabled')
    sender_name = models.CharField(max_length=150, default='MetroDrip Orders')
    enabled_payment_methods = models.JSONField(default=_default_payment_methods)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'identity_platformsetting'

    _cached_instance = None

    @classmethod
    def get_instance(cls, refresh=False):
        # Always read the database. A process-global cache survives test rollbacks
        # and would let one settings write disable payment methods for later tests.
        del refresh
        obj = cls.objects.filter(id=1).first()
        if obj is not None:
            cls._cached_instance = obj
            return obj
        instance = cls(
            id=1,
            enabled_payment_methods=_default_payment_methods(),
        )
        instance._state.adding = True
        cls._cached_instance = instance
        return instance

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        PlatformSetting._cached_instance = self

    def get_enabled_payment_methods(self):
        allowed = ('cod', 'gcash', 'maya', 'card')
        raw_methods = self.enabled_payment_methods if isinstance(self.enabled_payment_methods, list) else []
        methods = []
        for raw_method in raw_methods:
            method = str(raw_method).strip().lower()
            if method in allowed and method not in methods:
                methods.append(method)
        # An empty or corrupt row must not disable every rail. An explicit
        # stored selection, including one that omits COD, is honored.
        return methods or ['cod']


PlatformSetting._cached_instance = PlatformSetting(
    id=1,
    platform_name='MetroDrip',
    support_email='support@metrodrip.ph',
    currency='PHP',
    timezone='Asia/Manila',
    language='en',
    date_format='YYYY-MM-DD',
    staff_mfa_policy='optional',
    session_timeout_minutes='60',
    customer_registration='enabled',
    maintenance_mode='off',
    order_confirmation_emails='enabled',
    sender_name='MetroDrip Orders',
    enabled_payment_methods=_default_payment_methods(),
)


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
