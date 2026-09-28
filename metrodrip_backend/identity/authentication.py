from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from .models import CustomerAccessToken


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

        if token.last_used_at is None or (now - token.last_used_at).total_seconds() >= 300:
            CustomerAccessToken.objects.filter(pk=token.pk).update(last_used_at=now)
        return token.customer, token

    def authenticate_header(self, request):
        return 'Bearer'


class CustomerAuthentication(CustomerTokenAuthentication):
    """Compatibility name for callers migrated from numeric-ID pseudo-auth."""
