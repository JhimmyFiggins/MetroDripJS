from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from .models import CustomerAccessToken
from .policy import session_timeout

RESTRICTED_ALLOWED_PATHS = {
    '/users/me/password/',
    '/users/me/',
    '/api/users/me/',
    '/logout/',
    '/api/admin/logout/',
    '/health/',
}


class CustomerTokenAuthentication(BaseAuthentication):
    """Authenticate opaque bearer tokens without storing bearer material."""

    keyword = b'bearer'

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts:
            return None
        if parts[0].lower() != self.keyword or len(parts) != 2:
            raise AuthenticationFailed('Use a Bearer access token.')

        try:
            raw_token = parts[1].decode('ascii')
        except UnicodeDecodeError as error:
            raise AuthenticationFailed('Invalid access token.') from error

        # Numeric IDs were accepted as bearer credentials by the legacy API.
        # Rejecting them here prevents caller-selected identity on checkout.
        if len(raw_token) < 32 or raw_token.isdigit():
            raise AuthenticationFailed('Invalid access token.')

        now = timezone.now()
        token = CustomerAccessToken.objects.select_related('customer').filter(
            token_digest=CustomerAccessToken.digest(raw_token),
            revoked_at__isnull=True,
            expires_at__gt=now,
            customer__is_active=True,
        ).first()
        if not token:
            raise AuthenticationFailed('Invalid or expired access token.')

        activity = token.last_used_at or token.created_at
        if activity and now - activity > session_timeout():
            CustomerAccessToken.objects.filter(pk=token.pk, revoked_at__isnull=True).update(revoked_at=now)
            raise AuthenticationFailed('Invalid or expired access token.')

        if token.last_used_at is None or (now - token.last_used_at).total_seconds() >= 300:
            CustomerAccessToken.objects.filter(pk=token.pk).update(last_used_at=now)

        if (
            getattr(settings, 'EMAIL_OTP_ENFORCED', False)
            and token.customer.role == 'customer'
            and not token.customer.is_staff
            and token.customer.email_verified_at is None
        ):
            raise PermissionDenied({
                'error': 'Verify your email before using this account.',
                'code': 'email_unverified',
            })

        # Enforce initial temporary-password change requirement server-side
        if getattr(token.customer, 'password_change_required', False):
            request_path = request.path if request.path.endswith('/') else f"{request.path}/"
            if request_path not in RESTRICTED_ALLOWED_PATHS:
                raise PermissionDenied({
                    'error': 'Password change required before accessing platform features.',
                    'code': 'password_change_required',
                })

        return token.customer, token

    def authenticate_header(self, request):
        return 'Bearer'


class CustomerAuthentication(CustomerTokenAuthentication):
    """Compatibility name for callers migrated from numeric-ID pseudo-auth."""
