from rest_framework import permissions

class IsCustomerAuthenticated(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and getattr(request.user, 'is_authenticated', False))

class IsMerchantOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and getattr(request.user, 'is_authenticated', False)):
            return False
        role = getattr(request.user, 'role', '').lower()
        return role in ('merchant', 'admin', 'superadmin', 'staff')
