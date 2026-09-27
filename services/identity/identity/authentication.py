from rest_framework import authentication, exceptions
from django.conf import settings
from .models import AuthToken, AccountsCustomer

class VerifiableTokenAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        # 1. Check internal service mesh token from gateway
        internal_token = request.headers.get('X-Internal-Token')
        if internal_token and internal_token == getattr(settings, 'INTERNAL_TOKEN', None):
            user_id = request.headers.get('X-User-ID')
            if user_id:
                try:
                    customer = AccountsCustomer.objects.filter(id=int(user_id), is_active=True).first()
                    if customer:
                        return (customer, None)
                except (ValueError, TypeError):
                    pass

        # 2. Check standard Authorization header
        auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() not in ('bearer', 'token'):
            return None

        token_key = parts[1]
        token = AuthToken.objects.select_related('customer').filter(key=token_key).first()
        if not token:
            raise exceptions.AuthenticationFailed('Invalid or expired authentication token.')

        if not token.customer.is_active:
            raise exceptions.AuthenticationFailed('Customer account is disabled.')

        return (token.customer, token)

    def authenticate_header(self, request):
        return 'Bearer realm="api"'
