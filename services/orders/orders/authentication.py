import json
import urllib.request
import urllib.error
from rest_framework import authentication
from django.conf import settings

class SimpleUser:
    def __init__(self, user_id=None, role='anonymous', email='', is_authenticated=False):
        self.id = user_id
        self.role = role
        self.email = email
        self.is_authenticated = is_authenticated
        self.is_staff = role in ('admin', 'merchant', 'staff')

class OrdersServiceAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        internal_token = request.headers.get('X-Internal-Token')
        is_internal = internal_token and internal_token == getattr(settings, 'INTERNAL_TOKEN', None)

        user_id = request.headers.get('X-User-ID')
        user_role = request.headers.get('X-User-Role', 'customer' if user_id else 'anonymous')

        if is_internal and user_id:
            user = SimpleUser(
                user_id=int(user_id) if user_id.isdigit() else None,
                role=user_role,
                is_authenticated=True
            )
            return (user, None)

        # Check Authorization header (fallback or direct service call)
        auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
        if auth_header and auth_header.startswith(('Bearer ', 'Token ')):
            token = auth_header.split()[1]
            identity_url = getattr(settings, 'IDENTITY_SERVICE_URL', 'http://127.0.0.1:8001')
            try:
                req = urllib.request.Request(
                    f"{identity_url}/api/identity/verify-token/",
                    data=json.dumps({'token': token}).encode('utf-8'),
                    headers={'Content-Type': 'application/json'},
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode('utf-8'))
                        if data.get('valid'):
                            cust_data = data.get('customer', {})
                            user = SimpleUser(
                                user_id=cust_data.get('id'),
                                role=cust_data.get('role', 'customer'),
                                email=cust_data.get('email', ''),
                                is_authenticated=True
                            )
                            return (user, None)
            except Exception:
                pass

        return None
