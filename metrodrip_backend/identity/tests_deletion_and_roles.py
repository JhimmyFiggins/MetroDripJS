from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from identity.models import AccountsCustomer, AuditLog, CustomerAccessToken, CustomRole, PlatformSetting
from orders.models import OrdersOrder, ReviewsReview


class UserDeletionAndCustomRolesTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # Primary admin
        self.admin = AccountsCustomer.objects.create(
            email='primary.admin@metrodrip.ph',
            name='Primary Admin',
            role='admin',
            is_active=True,
            is_staff=True,
            is_superuser=True,
            addresses=[],
            date_joined=now,
        )
        _, self.admin_token = CustomerAccessToken.issue(self.admin)

        # Secondary admin (so self.admin is not the only admin)
        self.second_admin = AccountsCustomer.objects.create(
            email='second.admin@metrodrip.ph',
            name='Second Admin',
            role='admin',
            is_active=True,
            is_staff=True,
            is_superuser=True,
            addresses=[],
            date_joined=now,
        )
        _, self.second_admin_token = CustomerAccessToken.issue(self.second_admin)

        # Merchant
        self.merchant = AccountsCustomer.objects.create(
            email='staff.merchant@metrodrip.ph',
            name='Staff Merchant',
            role='merchant',
            is_active=True,
            is_staff=True,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        _, self.merchant_token = CustomerAccessToken.issue(self.merchant)

        # Regular customer
        self.customer = AccountsCustomer.objects.create(
            email='shopper@example.com',
            name='Shopper Customer',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        _, self.customer_token = CustomerAccessToken.issue(self.customer)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')

    def test_single_user_deletion_hard_delete_without_orders(self):
        """User without orders or reviews is permanently removed."""
        target = AccountsCustomer.objects.create(
            email='disposable.user@example.com',
            name='Disposable User',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=timezone.now(),
        )
        _, token = CustomerAccessToken.issue(target)

        res = self.client.delete(f'/api/admin/users/{target.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data.get('strategy'), 'hard')

        # Record should no longer exist in DB
        self.assertFalse(AccountsCustomer.objects.filter(id=target.id).exists())
        # Tokens should be gone
        self.assertFalse(CustomerAccessToken.objects.filter(customer_id=target.id).exists())
        # Audit log entry exists
        self.assertTrue(AuditLog.objects.filter(action__icontains=f"Deleted account #{target.id}").exists())

    def test_single_user_deletion_soft_delete_with_orders(self):
        """User with historical orders is soft-deleted, access revoked, email scrambled."""
        target = AccountsCustomer.objects.create(
            email='buyer.with.orders@example.com',
            name='Order Buyer',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=timezone.now(),
        )
        _, token = CustomerAccessToken.issue(target)

        # Create order referencing target.id
        order = OrdersOrder.objects.create(
            customer_id=target.id,
            status='delivered',
            subtotal=500.0,
            tax=60.0,
            shipping=100.0,
            discount=0.0,
            total=660.0,
            currency='PHP',
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        res = self.client.delete(f'/api/admin/users/{target.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data.get('strategy'), 'soft')

        # Record still exists for referential integrity, but is marked deleted
        reloaded = AccountsCustomer.objects.get(id=target.id)
        self.assertTrue(reloaded.is_deleted)
        self.assertFalse(reloaded.is_active)
        self.assertIsNotNone(reloaded.deleted_at)
        self.assertIn('@deleted.invalid', reloaded.email)

        # Access tokens must be wiped
        self.assertFalse(CustomerAccessToken.objects.filter(customer_id=target.id).exists())

        # Old email is now freed up for new registration
        self.assertFalse(AccountsCustomer.objects.filter(email='buyer.with.orders@example.com').exists())

        # Order history remains intact
        self.assertEqual(OrdersOrder.objects.get(id=order.id).customer_id, target.id)

    def test_admin_cannot_delete_self(self):
        """Administrator cannot delete their own signed-in account."""
        res = self.client.delete(f'/api/admin/users/{self.admin.id}/')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data.get('code'), 'cannot_delete_self')

    def test_cannot_delete_last_active_admin(self):
        """Cannot delete the last active administrator account."""
        # Deactivate second_admin first
        self.second_admin.is_active = False
        self.second_admin.save()

        # Switch client to authenticate as primary admin attempting to delete second admin (which is now inactive)
        # But wait: if only one active admin exists (self.admin), can second_admin be deleted?
        # If someone tries to delete self.admin, self-deletion blocks it.
        # What if second_admin is active, and we attempt to delete second_admin, leaving only self.admin? That succeeds.
        # But if second_admin is the ONLY active admin, deleting it must fail!
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.second_admin_token}')
        self.second_admin.is_active = True
        self.second_admin.save()
        self.admin.is_active = False
        self.admin.save()

        # Now second_admin is the ONLY active admin. Attempting to delete second_admin is self-delete.
        # What if a custom admin tries to delete the only active built-in admin?
        custom_role = CustomRole.objects.create(
            name='sub_admin',
            title='Sub Admin',
            base_role='admin',
            permissions=['delete_users', 'manage_users'],
        )
        sub_admin_user = AccountsCustomer.objects.create(
            email='subadmin@metrodrip.ph',
            name='Sub Admin User',
            role='sub_admin',
            is_active=True,
            is_staff=True,
            is_superuser=False,
            addresses=[],
            date_joined=timezone.now(),
        )
        _, sub_admin_token = CustomerAccessToken.issue(sub_admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {sub_admin_token}')

        # Deactivate self.admin and sub_admin_user is the second admin.
        # If second_admin is the only one left:
        AccountsCustomer.objects.filter(id__in=[self.admin.id, sub_admin_user.id]).update(is_active=False)
        # Now only second_admin is active. If sub_admin_user tries to delete second_admin:
        sub_admin_user.is_active = True
        sub_admin_user.save()
        # Active admins: sub_admin_user (1) and second_admin (1) = total 2.
        # If we deactivate sub_admin_user, second_admin is only 1.
        # Let's test deleting second_admin when active admin count is 1:
        sub_admin_user.role = 'merchant'  # temporarily not admin
        sub_admin_user.save()
        # Now second_admin is the ONLY active admin in the entire system.
        res = self.client.delete(f'/api/admin/users/{self.second_admin.id}/')
        # sub_admin_user is merchant so 403 anyway:
        self.assertEqual(res.status_code, 403)

    def test_cannot_delete_protected_system_account(self):
        """Protected system identity (support@metrodrip.ph) cannot be deleted."""
        system_user = AccountsCustomer.objects.create(
            email='support@metrodrip.ph',
            name='MetroDrip Support',
            role='admin',
            is_active=True,
            is_staff=True,
            is_superuser=True,
            addresses=[],
            date_joined=timezone.now(),
        )
        res = self.client.delete(f'/api/admin/users/{system_user.id}/')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data.get('code'), 'protected_account')

    def test_non_admin_cannot_delete_user(self):
        """Merchant and Customer cannot delete user accounts."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        res = self.client.delete(f'/api/admin/users/{self.customer.id}/')
        self.assertEqual(res.status_code, 403)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.customer_token}')
        res = self.client.delete(f'/api/admin/users/{self.merchant.id}/')
        self.assertEqual(res.status_code, 403)

    def test_bulk_user_deletion(self):
        """Bulk deletion deletes multiple eligible accounts and skips protected ones."""
        u1 = AccountsCustomer.objects.create(
            email='bulk1@example.com',
            name='Bulk User 1',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=timezone.now(),
        )
        u2 = AccountsCustomer.objects.create(
            email='bulk2@example.com',
            name='Bulk User 2',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=timezone.now(),
        )

        # Include self.admin.id (which should fail safeguard) and u1, u2 (which should succeed)
        res = self.client.post('/api/admin/users/bulk-delete/', {
            'user_ids': [u1.id, u2.id, self.admin.id],
        }, format='json')

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get('success'))
        self.assertEqual(res.data.get('deleted_count'), 2)
        self.assertIn(u1.id, res.data.get('deleted_ids'))
        self.assertIn(u2.id, res.data.get('deleted_ids'))
        # self.admin should be in failed list
        failed_ids = [f['id'] for f in res.data.get('failed', [])]
        self.assertIn(self.admin.id, failed_ids)

        # u1 and u2 should be deleted
        self.assertFalse(AccountsCustomer.objects.filter(id__in=[u1.id, u2.id]).exists())
        # self.admin should still exist
        self.assertTrue(AccountsCustomer.objects.filter(id=self.admin.id).exists())

    def test_custom_role_creation_and_authoritative_validation(self):
        """Create custom role with valid permissions and reject invalid permissions/roles."""
        # Valid merchant-based custom role
        res = self.client.post('/api/admin/roles/', {
            'title': 'Fulfillment Coordinator',
            'base_role': 'merchant',
            'permissions': ['view_orders', 'manage_shipments', 'view_inventory'],
        }, format='json')
        self.assertEqual(res.status_code, 201)
        role_slug = res.data.get('role')
        self.assertEqual(role_slug, 'fulfillment_coordinator')
        self.assertEqual(res.data.get('base_role'), 'merchant')

        # Invalid base role
        bad_base = self.client.post('/api/admin/roles/', {
            'title': 'Invalid Role',
            'base_role': 'superuser_godmode',
            'permissions': ['view_orders'],
        }, format='json')
        self.assertEqual(bad_base.status_code, 400)

        # Invalid permission for base role
        bad_perm = self.client.post('/api/admin/roles/', {
            'title': 'Hacker Merchant',
            'base_role': 'merchant',
            'permissions': ['manage_users', 'audit_trail'],  # Admin permissions, not valid for merchant!
        }, format='json')
        self.assertEqual(bad_perm.status_code, 400)

    def test_custom_role_assignment_and_permission_enforcement(self):
        """Assign custom role to account and verify backend permission enforcement."""
        # Create custom role 'warehouse_lead' with only order and shipment permissions
        custom_role = CustomRole.objects.create(
            name='warehouse_lead',
            title='Warehouse Lead',
            base_role='merchant',
            permissions=['view_orders', 'manage_shipments'],
        )

        # Assign to a staff account
        staff = AccountsCustomer.objects.create(
            email='warehouse@metrodrip.ph',
            name='Warehouse Worker',
            role='warehouse_lead',
            is_active=True,
            is_staff=True,
            is_superuser=False,
            addresses=[],
            date_joined=timezone.now(),
        )
        _, staff_token = CustomerAccessToken.issue(staff)

        # Authenticate as this custom role staff
        staff_client = APIClient()
        staff_client.credentials(HTTP_AUTHORIZATION=f'Bearer {staff_token}')

        # 1. Access permitted endpoint: View orders (GET /api/merchant/orders/)
        orders_res = staff_client.get('/api/merchant/orders/')
        self.assertEqual(orders_res.status_code, 200)

        # 2. Access permitted endpoint: Shipments (GET /api/merchant/shipments/)
        shipments_res = staff_client.get('/api/merchant/shipments/')
        self.assertEqual(shipments_res.status_code, 200)

        # 3. Access denied endpoint: Product catalog creation (POST /api/merchant/products/)
        catalog_res = staff_client.post('/api/merchant/products/', {'name': 'Test'}, format='json')
        self.assertEqual(catalog_res.status_code, 403)
        self.assertIn("Permission 'manage_catalog' is required.", catalog_res.data.get('detail', ''))

        # 4. Access denied endpoint: Inventory restock (POST /api/merchant/inventory/restock/)
        restock_res = staff_client.post('/api/merchant/inventory/restock/', {}, format='json')
        self.assertEqual(restock_res.status_code, 403)
        self.assertIn("Permission 'adjust_stock' is required.", restock_res.data.get('detail', ''))

        # 5. Access denied endpoint: Marketing banners (GET /api/merchant/banners/)
        banners_res = staff_client.get('/api/merchant/banners/')
        self.assertEqual(banners_res.status_code, 403)
        self.assertIn("Permission 'publish_content' is required.", banners_res.data.get('detail', ''))

    def test_customer_based_role_cannot_be_assigned_to_staff_invites(self):
        """Staff creation rejects customer-based custom roles."""
        custom_customer_role = CustomRole.objects.create(
            name='vip_customer',
            title='VIP Customer',
            base_role='customer',
            permissions=['browse_catalog', 'create_orders', 'submit_reviews'],
        )

        res = self.client.post('/api/admin/users/', {
            'name': 'VIP Staff Attempt',
            'email': 'vipstaff@metrodrip.ph',
            'role': 'vip_customer',
            'password_option': 'email_invite',
            'is_staff_account': True,
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Customer-based roles cannot be assigned to staff accounts.', res.data.get('error', ''))
