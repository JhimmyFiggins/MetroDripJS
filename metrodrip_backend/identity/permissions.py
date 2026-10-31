from rest_framework.permissions import BasePermission

BASE_ROLES = {'admin', 'merchant', 'customer'}

ROLE_PERMISSIONS_REGISTRY = {
    'admin': [
        {
            'id': 'manage_users',
            'label': 'User administration',
            'description': 'Create staff accounts, suspend/reactivate accounts, and manage user details',
            'default': 'allow',
        },
        {
            'id': 'delete_users',
            'label': 'User deletion',
            'description': 'Permanently remove or soft-delete single and bulk user accounts',
            'default': 'allow',
        },
        {
            'id': 'manage_roles',
            'label': 'Role & permissions management',
            'description': 'Create custom roles and configure capability matrices',
            'default': 'allow',
        },
        {
            'id': 'manage_settings',
            'label': 'Platform settings',
            'description': 'Configure store currency, timezone, security policies, and maintenance mode',
            'default': 'allow',
        },
        {
            'id': 'audit_trail',
            'label': 'Audit trail access',
            'description': 'View security logs and export administrative audit trail to CSV',
            'default': 'allow',
        },
        {
            'id': 'export_users',
            'label': 'Export user directory',
            'description': 'Export customer and staff account directory to CSV',
            'default': 'allow',
        },
        {
            'id': 'manage_shipping',
            'label': 'Shipping zone administration',
            'description': 'Configure shipping zones, regional rates, and delivery fees',
            'default': 'allow',
        },
        {
            'id': 'read_all',
            'label': 'Read all platform records',
            'description': 'Full read access across administrative models',
            'default': 'allow',
        },
        {
            'id': 'write_all',
            'label': 'Write all platform records',
            'description': 'Full write access across administrative models',
            'default': 'allow',
        },
    ],
    'merchant': [
        {
            'id': 'manage_catalog',
            'label': 'Catalog & product management',
            'description': 'Create and edit products, manage variants, categories, and upload media',
            'default': 'allow',
        },
        {
            'id': 'manage_inventory',
            'label': 'Manage inventory',
            'description': 'Inspect and replenish warehouse inventory stock levels',
            'default': 'allow',
        },
        {
            'id': 'view_inventory',
            'label': 'View inventory',
            'description': 'Inspect warehouse stock levels, variant allocations, and movement history',
            'default': 'allow',
        },
        {
            'id': 'adjust_stock',
            'label': 'Adjust stock & restock',
            'description': 'Perform manual inventory adjustments and stock replenishments',
            'default': 'allow',
        },
        {
            'id': 'view_orders',
            'label': 'View orders',
            'description': 'Inspect customer orders, fulfillment statuses, and sales analytics',
            'default': 'allow',
        },
        {
            'id': 'manage_orders',
            'label': 'Order management',
            'description': 'Update order statuses, cancel unfulfilled orders, and export order history',
            'default': 'allow',
        },
        {
            'id': 'manage_shipments',
            'label': 'Shipment management',
            'description': 'Fulfill orders, dispatch couriers, and update tracking numbers',
            'default': 'allow',
        },
        {
            'id': 'edit_shipping_zones',
            'label': 'Shipping configurations',
            'description': 'View and update merchant-level shipping fees and zone coverage',
            'default': 'allow',
        },
        {
            'id': 'reply_reviews',
            'label': 'Customer review moderation',
            'description': 'Inspect customer reviews, moderate ratings, and submit official replies',
            'default': 'allow',
        },
        {
            'id': 'publish_content',
            'label': 'Publish marketing content',
            'description': 'Upload and publish promotional storefront banners and announcements',
            'default': 'allow',
        },
    ],
    'customer': [
        {
            'id': 'manage_profile',
            'label': 'Profile management',
            'description': 'Update profile details, phone numbers, and saved shipping addresses',
            'default': 'allow',
        },
        {
            'id': 'browse_catalog',
            'label': 'Browse products & catalog',
            'description': 'Explore product catalog, filter categories, and view product details',
            'default': 'allow',
        },
        {
            'id': 'create_orders',
            'label': 'Create orders & checkout',
            'description': 'Add items to cart, select payment methods, and complete purchase checkout',
            'default': 'allow',
        },
        {
            'id': 'view_own_orders',
            'label': 'View order history',
            'description': 'Track status of placed orders and access historical receipts',
            'default': 'allow',
        },
        {
            'id': 'submit_reviews',
            'label': 'Submit product reviews',
            'description': 'Submit ratings and written product feedback for verified purchases',
            'default': 'allow',
        },
    ],
}


def normalize_base_role(role_name):
    if not role_name:
        return 'customer'
    r = str(role_name).strip().lower()
    if r in ('admin', 'administrator'):
        return 'admin'
    if r == 'merchant':
        return 'merchant'
    if r == 'customer':
        return 'customer'
    return r


def get_role_definition(role_name):
    """
    Returns (base_role, permissions_set, is_custom, custom_role_obj)
    """
    normalized = normalize_base_role(role_name)
    if normalized in ('admin', 'merchant', 'customer'):
        all_perms = {p['id'] for p in ROLE_PERMISSIONS_REGISTRY.get(normalized, [])}
        return normalized, all_perms, False, None

    from .models import CustomRole
    custom = CustomRole.objects.filter(name=role_name).first()
    if custom:
        base = normalize_base_role(custom.base_role)
        perms = set(custom.permissions or [])
        return base, perms, True, custom

    return None, set(), False, None


def get_user_base_role(user):
    if not user:
        return None
    role = getattr(user, 'role', None)
    base, _, _, _ = get_role_definition(role)
    return base


def get_user_permissions(user):
    if not user:
        return set()
    role = getattr(user, 'role', None)
    _, perms, _, _ = get_role_definition(role)
    return perms


def has_role_permission(user, permission_name):
    if not user or not permission_name:
        return False
    role = getattr(user, 'role', None)
    if role in ('admin', 'administrator'):
        return True
    perms = get_user_permissions(user)
    # Check if permission directly matches or is satisfied by broader permission
    if permission_name in perms:
        return True
    if permission_name in ('view_inventory', 'adjust_stock') and 'manage_inventory' in perms:
        return True
    if permission_name == 'manage_inventory' and ('view_inventory' in perms and 'adjust_stock' in perms):
        return True
    return False


class IsAdminRole(BasePermission):
    """Allow active staff accounts whose base role is administrator and has required permission."""

    message = 'Administrator access is required.'

    def has_permission(self, request, view):
        user = request.user
        if not (
            getattr(user, 'is_authenticated', False)
            and getattr(user, 'is_active', False)
            and not getattr(user, 'is_deleted', False)
            and getattr(user, 'is_staff', False)
            and not getattr(user, 'password_change_required', False)
        ):
            return False

        base_role = get_user_base_role(user)
        if base_role != 'admin':
            self.message = 'Administrator access is required.'
            return False

        required_perm = getattr(view, 'required_permission', None)
        if hasattr(view, 'get_required_permission'):
            required_perm = view.get_required_permission(request)

        if required_perm and not has_role_permission(user, required_perm):
            self.message = f"Permission '{required_perm}' is required."
            return False

        return True


class IsMerchantOrAdminRole(BasePermission):
    """Allow active merchant staff and administrators with required permissions."""

    message = 'Merchant or administrator access is required.'

    def has_permission(self, request, view):
        user = request.user
        if not (
            getattr(user, 'is_authenticated', False)
            and getattr(user, 'is_active', False)
            and not getattr(user, 'is_deleted', False)
            and getattr(user, 'is_staff', False)
            and not getattr(user, 'password_change_required', False)
        ):
            return False

        base_role = get_user_base_role(user)
        if base_role not in {'merchant', 'admin'}:
            self.message = 'Merchant or administrator access is required.'
            return False

        required_perm = getattr(view, 'required_permission', None)
        if hasattr(view, 'get_required_permission'):
            required_perm = view.get_required_permission(request)

        if required_perm and not has_role_permission(user, required_perm):
            self.message = f"Permission '{required_perm}' is required."
            return False

        return True
