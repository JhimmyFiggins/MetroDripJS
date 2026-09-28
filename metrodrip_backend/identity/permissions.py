from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    """Allow active staff accounts whose persisted role is administrator."""

    message = 'Administrator access is required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            getattr(user, 'is_authenticated', False)
            and getattr(user, 'is_active', False)
            and getattr(user, 'is_staff', False)
            and getattr(user, 'role', None) == 'admin'
        )


class IsMerchantOrAdminRole(BasePermission):
    """Allow active merchant staff and administrators on store operations."""

    message = 'Merchant or administrator access is required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            getattr(user, 'is_authenticated', False)
            and getattr(user, 'is_active', False)
            and getattr(user, 'is_staff', False)
            and getattr(user, 'role', None) in {'merchant', 'admin'}
        )
