import json
import urllib.request
from types import SimpleNamespace

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission


class ContentAuthentication(BaseAuthentication):
    def authenticate(self, request):
        internal_token = request.headers.get('X-Internal-Token')
        if internal_token and internal_token == settings.INTERNAL_TOKEN:
            return SimpleNamespace(is_authenticated=True,
                role=request.headers.get('X-User-Role', 'anonymous')), None

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
                    return SimpleNamespace(is_authenticated=True, id=customer['id'],
                                           role=customer.get('role', 'customer')), None
            except Exception:
                return None
        return None


class IsMerchantOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(getattr(request.user, 'is_authenticated', False) and
                    getattr(request.user, 'role', '') in ('merchant', 'admin', 'superadmin', 'staff'))
