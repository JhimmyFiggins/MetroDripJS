from rest_framework import permissions
from django.conf import settings

class IsInternalService(permissions.BasePermission):
    def has_permission(self, request, view):
        internal_token = request.headers.get('X-Internal-Token')
        return bool(internal_token and internal_token == getattr(settings, 'INTERNAL_TOKEN', None))

class IsMerchantOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        internal_token = request.headers.get('X-Internal-Token')
        if internal_token and internal_token == getattr(settings, 'INTERNAL_TOKEN', None):
            user_role = getattr(request.user, 'role', '')
            return user_role in ('merchant', 'admin', 'superadmin', 'staff')
        return False
