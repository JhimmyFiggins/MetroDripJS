from rest_framework import permissions
from django.conf import settings


class IsInternalService(permissions.BasePermission):
    """Permission for internal service calls only."""
    def has_permission(self, request, view):
        internal_token = request.headers.get('X-Internal-Token')
        return bool(internal_token and internal_token == getattr(settings, 'INTERNAL_TOKEN', None))


class IsAuthenticatedCustomer(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(getattr(request.user, 'is_authenticated', False) and getattr(request.user, 'id', None))


class IsMerchantOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user_role = getattr(request.user, 'role', '')
        return bool(getattr(request.user, 'is_authenticated', False) and
                    user_role in ('merchant', 'admin', 'superadmin', 'staff'))
