import csv
from datetime import timedelta
from django.http import HttpResponse
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from identity.authentication import CustomerTokenAuthentication
from identity.permissions import IsAdminRole
from .models import AccountsCustomer, AuditLog
from fulfillment.models import ShippingShippingZone


ALLOWED_ACCOUNT_ROLES = {'customer', 'merchant', 'admin'}


def _parse_boolean(value):
    if isinstance(value, bool):
        return value
    raise ValueError('must be a boolean')


def _csv_cell(value):
    text = '' if value is None else str(value)
    return "'" + text if text.startswith(('=', '+', '-', '@', '\t', '\r')) else text


def _audit(request, action, target_model=None, target_id=None):
    AuditLog.objects.create(
        actor=request.user.name or request.user.email,
        actor_role=request.user.role,
        action=action,
        target_model=target_model,
        target_id=str(target_id) if target_id is not None else None,
    )


class AdminAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAdminRole]


class AdminDashboardAPIView(AdminAPIView):
    def get(self, request):
        now = timezone.now()
        yesterday = now - timedelta(hours=24)
        week_ago = now - timedelta(days=7)

        total_customers = AccountsCustomer.objects.filter(role='customer').count()
        new_this_week = AccountsCustomer.objects.filter(role='customer', date_joined__gte=week_ago).count()
        merchants_count = AccountsCustomer.objects.filter(role='merchant').count()
        admins_count = AccountsCustomer.objects.filter(role='admin').count()
        suspended_count = AccountsCustomer.objects.filter(is_active=False).count()
        audit_count_24h = AuditLog.objects.filter(created_at__gte=yesterday).count()

        recent_users_qs = AccountsCustomer.objects.all().order_by('-date_joined')[:10]
        users_data = [
            {
                'id': u.id,
                'email': u.email,
                'name': u.name,
                'role': u.role,
                'status': 'Active' if u.is_active else 'Suspended',
                'date_joined': u.date_joined.isoformat() if u.date_joined else None,
            }
            for u in recent_users_qs
        ]

        recent_audit_qs = AuditLog.objects.all().order_by('-created_at')[:10]
        audit_data = [
            {
                'id': a.id,
                'when': a.created_at.strftime('%H:%M') if a.created_at else None,
                'actor': a.actor,
                'action': a.action,
            }
            for a in recent_audit_qs
        ]

        return Response({
            'metrics': {
                'total_customers': total_customers,
                'weekly_delta': f"+{new_this_week} this week",
                'staff_accounts': merchants_count + admins_count,
                'staff_breakdown': f"{merchants_count} merchant · {admins_count} admin",
                'suspended_count': suspended_count,
                'audit_events_24h': audit_count_24h,
            },
            'users': users_data,
            'audit_trail': audit_data,
        })


class AdminUsersAPIView(AdminAPIView):
    def get(self, request):
        qs = AccountsCustomer.objects.all().order_by('-date_joined')

        search = request.GET.get('search', '').strip()
        if search:
            qs = qs.filter(email__icontains=search) | qs.filter(name__icontains=search)

        role = request.GET.get('role', '').strip()
        if role and role != 'all':
            qs = qs.filter(role=role)

        status_filter = request.GET.get('status', '').strip().lower()
        if status_filter == 'active':
            qs = qs.filter(is_active=True)
        elif status_filter == 'suspended':
            qs = qs.filter(is_active=False)

        data = [
            {
                'id': u.id,
                'email': u.email,
                'name': u.name,
                'role': u.role,
                'status': 'Active' if u.is_active else 'Suspended',
                'phone': u.phone,
                'date_joined': u.date_joined.isoformat() if u.date_joined else None,
            }
            for u in qs[:50]
        ]
        return Response(data)

    def post(self, request):
        data = request.data
        raw_email = data.get('email', '')
        raw_name = data.get('name', '')
        raw_role = data.get('role', 'customer')
        raw_phone = data.get('phone', '')
        if not all(isinstance(value, str) for value in (raw_email, raw_name, raw_role, raw_phone)):
            return Response(
                {'error': 'email, name, role, and phone must be text.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = raw_email.strip()
        name = raw_name.strip()
        role = raw_role.strip().lower()
        phone = raw_phone.strip()

        email = email.lower()
        if not email or not name:
            return Response({'error': 'Email and name are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if role not in ALLOWED_ACCOUNT_ROLES:
            return Response({'error': 'Select a supported account role.'}, status=status.HTTP_400_BAD_REQUEST)

        if AccountsCustomer.objects.filter(email__iexact=email).exists():
            return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        user = AccountsCustomer.objects.create(
            email=email,
            name=name,
            role=role,
            phone=phone,
            password=make_password(None),
            addresses=[],
            is_active=True,
            is_staff=role in ['admin', 'merchant'],
            is_superuser=role == 'admin',
            date_joined=timezone.now(),
        )

        _audit(request, f"Created {role} account → {name}", 'AccountsCustomer', user.id)

        return Response({
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'role': user.role,
            'status': 'Active',
            'password_setup_required': True,
        }, status=status.HTTP_201_CREATED)


class AdminUserDetailAPIView(AdminAPIView):
    def patch(self, request, pk):
        try:
            user = AccountsCustomer.objects.get(pk=pk)
        except AccountsCustomer.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_active = request.data.get('is_active')
        role = request.data.get('role')

        if is_active is not None and not isinstance(is_active, bool):
            return Response({'error': 'is_active must be a boolean.'}, status=status.HTTP_400_BAD_REQUEST)
        if role is not None:
            if not isinstance(role, str) or role.strip().lower() not in ALLOWED_ACCOUNT_ROLES:
                return Response({'error': 'Select a supported account role.'}, status=status.HTTP_400_BAD_REQUEST)
            role = role.strip().lower()
        if user.id == request.user.id and (is_active is False or (role and role != 'admin')):
            return Response(
                {'error': 'You cannot suspend or remove your own administrator access.'},
                status=status.HTTP_409_CONFLICT,
            )

        if is_active is not None:
            user.is_active = bool(is_active)
            action_desc = f"{'Reactivated' if user.is_active else 'Suspended'} customer #{user.id} ({user.name})"
            _audit(request, action_desc, 'AccountsCustomer', user.id)

        if role:
            old_role = user.role
            user.role = role
            user.is_staff = role in ['admin', 'merchant']
            user.is_superuser = role == 'admin'
            _audit(request, f"Granted {role} role → {user.name} (was {old_role})", 'AccountsCustomer', user.id)

        user.save()
        return Response({
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'role': user.role,
            'status': 'Active' if user.is_active else 'Suspended',
        })


class AdminAuditLogsAPIView(AdminAPIView):
    def get(self, request):
        qs = AuditLog.objects.all().order_by('-created_at')

        search = request.GET.get('search', '').strip()
        if search:
            qs = qs.filter(action__icontains=search) | qs.filter(actor__icontains=search)

        actor_filter = request.GET.get('actor', '').strip()
        if actor_filter and actor_filter != 'all':
            qs = qs.filter(actor__icontains=actor_filter)

        module_filter = request.GET.get('module', '').strip()
        if module_filter and module_filter != 'all':
            qs = qs.filter(target_model__icontains=module_filter)

        logs = qs[:50]
        data = [
            {
                'id': a.id,
                'when': a.created_at.strftime('%H:%M') if a.created_at else None,
                'actor': a.actor,
                'role': a.actor_role,
                'action': a.action,
                'target_model': a.target_model,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            }
            for a in logs
        ]
        return Response(data)


class AdminExportUsersCSVAPIView(AdminAPIView):
    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="metrodrip_users_{timezone.now().strftime("%Y%m%d")}.csv"'

        writer = csv.writer(response)
        writer.writerow(['ID', 'Email', 'Name', 'Role', 'Status', 'Date Joined'])

        for u in AccountsCustomer.objects.all().order_by('-date_joined'):
            writer.writerow([
                u.id,
                _csv_cell(u.email),
                _csv_cell(u.name),
                _csv_cell(u.role),
                'Active' if u.is_active else 'Suspended',
                u.date_joined.strftime('%Y-%m-%d %H:%M') if u.date_joined else '',
            ])

        _audit(request, 'Exported customer & staff directory to CSV', 'AccountsCustomer')
        return response


class AdminShippingZonesAPIView(AdminAPIView):
    def get(self, request):
        zones = ShippingShippingZone.objects.all().order_by('id')

        data = [
            {
                'id': z.id,
                'name': z.name,
                'fee': z.fee,
                'formatted_fee': f"₱{z.fee:,}",
                'is_active': z.is_active,
            }
            for z in zones
        ]
        return Response(data)

    def patch(self, request, pk):
        try:
            zone = ShippingShippingZone.objects.get(pk=pk)
        except ShippingShippingZone.DoesNotExist:
            return Response({'error': 'Shipping zone not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_fee = request.data.get('fee')
        is_active = request.data.get('is_active')

        if new_fee is None and is_active is None:
            return Response(
                {'error': 'Provide fee or is_active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            parsed_fee = int(new_fee) if new_fee is not None else None
        except (TypeError, ValueError):
            return Response({'error': 'fee must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if parsed_fee is not None and parsed_fee < 0:
            return Response({'error': 'fee must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed_is_active = _parse_boolean(is_active) if is_active is not None else None
        except ValueError:
            return Response({'error': 'is_active must be a boolean.'}, status=status.HTTP_400_BAD_REQUEST)

        if parsed_fee is not None:
            old_fee = zone.fee
            zone.fee = parsed_fee
            AuditLog.objects.create(
                actor=request.user.name,
                actor_role='admin',
                action=f"Updated {zone.name} shipping fee → ₱{zone.fee} (was ₱{old_fee})",
                target_model='ShippingShippingZone',
                target_id=str(zone.id),
            )

        if parsed_is_active is not None:
            zone.is_active = parsed_is_active
            AuditLog.objects.create(
                actor=request.user.name,
                actor_role='admin',
                action=f"{'Enabled' if zone.is_active else 'Disabled'} shipping zone {zone.name}",
                target_model='ShippingShippingZone',
                target_id=str(zone.id),
            )

        zone.save()
        return Response({
            'id': zone.id,
            'name': zone.name,
            'fee': zone.fee,
            'formatted_fee': f"₱{zone.fee:,}",
            'is_active': zone.is_active,
            'message': f"Updated {zone.name} shipping fee to ₱{zone.fee}.",
        })


class AdminRolesAPIView(AdminAPIView):
    def get(self, request):
        roles_summary = [
            {
                'role': 'admin',
                'title': 'Administrator',
                'description': 'Full access to user management, platform configurations, financial reports, and audit logs.',
                'user_count': AccountsCustomer.objects.filter(role='admin').count(),
                'permissions': ['read_all', 'write_all', 'manage_users', 'manage_settings', 'audit_trail'],
            },
            {
                'role': 'merchant',
                'title': 'Store Merchant',
                'description': 'Manage product catalog, inventory restock, fulfillment orders, and respond to customer reviews.',
                'user_count': AccountsCustomer.objects.filter(role='merchant').count(),
                'permissions': ['manage_catalog', 'manage_inventory', 'manage_orders', 'reply_reviews'],
            },
            {
                'role': 'customer',
                'title': 'Customer',
                'description': 'Browse catalog, place drops and orders, save shipping addresses, and submit product reviews.',
                'user_count': AccountsCustomer.objects.filter(role='customer').count(),
                'permissions': ['browse_catalog', 'create_orders', 'submit_reviews'],
            },
        ]
        return Response(roles_summary)

    def post(self, request):
        return Response(
            {
                'error': 'Custom role persistence is not configured. No role was created.',
                'code': 'role_persistence_unconfigured',
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )


class AdminSettingsAPIView(AdminAPIView):
    def get(self, request):
        return Response(
            {
                'error': 'Platform settings persistence is not configured.',
                'code': 'settings_persistence_unconfigured',
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )

    def patch(self, request):
        return Response({
            'error': 'Platform settings persistence is not configured. No settings were changed.',
            'code': 'settings_persistence_unconfigured',
        }, status=status.HTTP_501_NOT_IMPLEMENTED)


class AdminUserResetPasswordAPIView(AdminAPIView):
    def post(self, request, pk):
        try:
            user = AccountsCustomer.objects.get(pk=pk)
        except AccountsCustomer.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        _audit(
            request,
            f"Requested password reset for user #{user.id}; delivery is not configured",
            'AccountsCustomer',
            user.id,
        )
        return Response({
            'error': 'Password-reset delivery is not configured. No reset token was generated or exposed.',
            'code': 'reset_delivery_unconfigured',
        }, status=status.HTTP_501_NOT_IMPLEMENTED)


class AdminExportAuditLogsCSVAPIView(AdminAPIView):
    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="metrodrip_audit_log_{timezone.now().strftime("%Y%m%d")}.csv"'

        writer = csv.writer(response)
        writer.writerow(['ID', 'Timestamp', 'Actor', 'Role', 'Action', 'Target Model', 'Target ID'])

        for log in AuditLog.objects.all().order_by('-created_at'):
            writer.writerow([
                log.id,
                log.created_at.strftime('%Y-%m-%d %H:%M:%S') if log.created_at else '',
                _csv_cell(log.actor),
                _csv_cell(log.actor_role),
                _csv_cell(log.action),
                _csv_cell(log.target_model or ''),
                _csv_cell(log.target_id or ''),
            ])

        _audit(request, 'Exported security audit trail to CSV', 'AuditLog')
        return response
