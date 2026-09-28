from rest_framework import authentication
from django.conf import settings
import json
import urllib.request

class SimpleUser:
    def __init__(self, user_id=None, role='anonymous', email='', is_authenticated=False):
        self.id = user_id
        self.role = role
        self.email = email
        self.is_authenticated = is_authenticated
        self.is_staff = role in ('admin', 'merchant', 'staff')

class InternalServiceOrGatewayAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        internal_token = request.headers.get('X-Internal-Token')
        is_internal = internal_token and internal_token == getattr(settings, 'INTERNAL_TOKEN', None)

        user_id = request.headers.get('X-User-ID')
        user_role = request.headers.get('X-User-Role', 'customer' if user_id else 'anonymous')

        if is_internal:
            # Internal service or gateway call
            user = SimpleUser(
                user_id=int(user_id) if user_id and user_id.isdigit() else None,
                role=user_role,
                is_authenticated=bool(user_id) or is_internal
            )
            return (user, None)

        parts = (request.headers.get('Authorization') or '').split()
        if len(parts) == 2 and parts[0].lower() in ('bearer', 'token'):
            try:
                req = urllib.request.Request(
                    f'{settings.IDENTITY_SERVICE_URL}/api/identity/verify-token/',
                    data=json.dumps({'token': parts[1]}).encode(),
                    headers={'Content-Type': 'application/json'}, method='POST')
                with urllib.request.urlopen(req, timeout=2) as response:
                    data = json.loads(response.read())
                customer = data.get('customer', {})
                if data.get('valid') and customer.get('id'):
                    return SimpleUser(customer['id'], customer.get('role', 'customer'),
                                      customer.get('email', ''), True), None
            except Exception:
                return None
        return None
