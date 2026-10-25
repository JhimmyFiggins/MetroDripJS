import csv
import re
import secrets
from datetime import timedelta
from django.conf import settings
from django.http import HttpResponse
from django.db import transaction
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from identity.authentication import CustomerTokenAuthentication
from identity.permissions import IsAdminRole
from .models import AccountsCustomer, AuditLog, PlatformSetting, CustomRole, PasswordResetToken
from .brevo import is_brevo_configured, build_reset_url, send_transactional_email, get_sender_identity
from .email_templates import render_welcome_setup, render_admin_password_reset
from fulfillment.models import ShippingShippingZone


ALLOWED_ACCOUNT_ROLES = {'customer', 'merchant', 'admin'}
ALLOWED_DATE_FORMATS = {'YYYY-MM-DD', 'DD MMM YYYY', 'MM/DD/YYYY'}


def generate_secure_temporary_password(length=14):
    """
    Generate a cryptographically secure temporary password meeting NIST SP 800-63B
    and MetroDrip complexity guidelines.
    """
    uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    lowers = "abcdefghjkmnpqrstuvwxyz"
    digits = "23456789"
    symbols = "!@#$%&*+=-"
    chars = [
        secrets.choice(uppers),
        secrets.choice(lowers),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]
    all_pool = uppers + lowers + digits + symbols
    chars += [secrets.choice(all_pool) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


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
                'password_change_required': u.password_change_required,
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
        password_option = str(data.get('password_option', '')).strip().lower()
        custom_password = data.get('password')

        if not all(isinstance(value, str) for value in (raw_email, raw_name, raw_role, raw_phone)):
            return Response(
                {'error': 'email, name, role, and phone must be text.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = raw_email.strip().lower()
        name = raw_name.strip()
        role = raw_role.strip().lower()
        phone = raw_phone.strip()

        if not email or not name:
            return Response({'error': 'Email and name are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if role not in ALLOWED_ACCOUNT_ROLES:
            return Response({'error': 'Select a supported account role.'}, status=status.HTTP_400_BAD_REQUEST)

        if AccountsCustomer.objects.filter(email__iexact=email).exists():
            return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        # Determine password provisioning strategy
        temp_password = None
        password_mode = 'unusable'
        invite_sent = False

        if password_option == 'custom' or (custom_password and not password_option):
            if not isinstance(custom_password, str) or not custom_password:
                return Response({'error': 'Temporary password is required for custom option.'}, status=status.HTTP_400_BAD_REQUEST)
            from .policy import password_length_error
            length_error = password_length_error(custom_password)
            if length_error:
                return Response({'error': length_error, 'code': 'password_too_short'}, status=status.HTTP_400_BAD_REQUEST)
            
            prohibited_terms = ['password', '12345678', 'metrodrip', name.lower(), email.split('@')[0].lower()]
            for term in prohibited_terms:
                if term and len(term) >= 4 and term in custom_password.lower():
                    return Response({'error': f'Password contains easily guessable term "{term}".'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                validate_password(custom_password)
            except ValidationError as err:
                return Response({'error': err.messages[0]}, status=status.HTTP_400_BAD_REQUEST)

            hashed_password = make_password(custom_password)
            password_mode = 'custom_temporary'

        elif password_option == 'generated':
            temp_password = generate_secure_temporary_password()
            hashed_password = make_password(temp_password)
            password_mode = 'generated_temporary'

        elif password_option == 'email_invite':
            if not is_brevo_configured():
                return Response({
                    'error': 'Email delivery is not configured. A Brevo API key is required to send account setup invitations.',
                    'code': 'reset_delivery_unconfigured',
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            hashed_password = make_password(None)
            password_mode = 'email_invite'

        else:
            hashed_password = make_password(None)
            password_mode = 'default'

        user = AccountsCustomer.objects.create(
            email=email,
            name=name,
            role=role,
            phone=phone,
            password=hashed_password,
            addresses=[],
            is_active=True,
            is_staff=role in ['admin', 'merchant'],
            is_superuser=role == 'admin',
            date_joined=timezone.now(),
            password_change_required=True,
        )

        _audit(request, f"Created {role} account → {name} (mode: {password_mode})", 'AccountsCustomer', user.id)

        # Dispatch setup email if requested or default when configured
        if password_mode in ('email_invite', 'default') and is_brevo_configured():
            token_obj, raw_token = PasswordResetToken.issue(
                customer=user,
                purpose='setup',
                created_by=request.user,
            )
            setup_url = build_reset_url(raw_token, role=user.role)
            email_data = render_welcome_setup(user, setup_url)
            send_res = send_transactional_email(
                user.email,
                user.name,
                email_data['subject'],
                email_data['html'],
                email_data['text'],
            )
            invite_sent = bool(send_res.get('success'))

        response_data = {
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'role': user.role,
            'status': 'Active',
            'password_setup_required': True,
            'password_change_required': True,
            'password_mode': password_mode,
            'invite_sent': invite_sent,
        }
        if temp_password:
            response_data['temporary_password'] = temp_password

        return Response(response_data, status=status.HTTP_201_CREATED)


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
                'is_custom': False,
            },
            {
                'role': 'merchant',
                'title': 'Store Merchant',
                'description': 'Manage product catalog, inventory restock, fulfillment orders, and respond to customer reviews.',
                'user_count': AccountsCustomer.objects.filter(role='merchant').count(),
                'permissions': ['manage_catalog', 'manage_inventory', 'manage_orders', 'reply_reviews'],
                'is_custom': False,
            },
            {
                'role': 'customer',
                'title': 'Customer',
                'description': 'Browse catalog, place drops and orders, save shipping addresses, and submit product reviews.',
                'user_count': AccountsCustomer.objects.filter(role='customer').count(),
                'permissions': ['browse_catalog', 'create_orders', 'submit_reviews'],
                'is_custom': False,
            },
        ]
        custom_roles = [
            {
                'role': r.name,
                'title': r.title,
                'base_role': r.base_role,
                'description': r.description or f"Custom staff role based on {r.base_role}.",
                'user_count': AccountsCustomer.objects.filter(role=r.name).count(),
                'permissions': r.permissions,
                'is_custom': True,
            }
            for r in CustomRole.objects.all()
        ]
        return Response(roles_summary + custom_roles)

    def post(self, request):
        title = (request.data.get('title') or '').strip()
        base_role = (request.data.get('base_role') or 'merchant').strip().lower()
        permissions = request.data.get('permissions') or []

        if not title:
            return Response({'error': 'Role title is required.'}, status=status.HTTP_400_BAD_REQUEST)

        slug = re.sub(r'[^a-z0-9]+', '_', title.lower()).strip('_')
        if not slug:
            slug = f"role_{secrets.token_hex(4)}"

        if CustomRole.objects.filter(name=slug).exists() or slug in ALLOWED_ACCOUNT_ROLES:
            return Response({'error': f'A role with identifier "{slug}" already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        role = CustomRole.objects.create(
            name=slug,
            title=title,
            base_role=base_role,
            description=f"Custom staff role based on {base_role}.",
            permissions=permissions,
        )
        _audit(request, f"Created custom role {role.title}", "CustomRole", role.id)
        return Response({
            'id': role.id,
            'role': role.name,
            'title': role.title,
            'base_role': role.base_role,
            'permissions': role.permissions,
            'user_count': 0,
            'is_custom': True,
        }, status=status.HTTP_201_CREATED)


class AdminSettingsAPIView(AdminAPIView):
    def get(self, request):
        setting = PlatformSetting.get_instance(refresh=True)
        return Response({
            'settings': {
                'platform_name': setting.platform_name,
                'support_email': setting.support_email,
                'currency': setting.currency,
                'timezone': setting.timezone,
                'language': setting.language,
                'date_format': setting.date_format,
                'staff_mfa_policy': setting.staff_mfa_policy,
                'session_timeout_minutes': str(setting.session_timeout_minutes),
                'customer_registration': setting.customer_registration,
                'registration_message': getattr(setting, 'registration_message', ''),
                'maintenance_mode': setting.maintenance_mode,
                'maintenance_message': getattr(setting, 'maintenance_message', ''),
                'maintenance_scheduled_start': setting.maintenance_scheduled_start.isoformat() if setting.maintenance_scheduled_start else None,
                'maintenance_scheduled_end': setting.maintenance_scheduled_end.isoformat() if setting.maintenance_scheduled_end else None,
                'password_min_length': setting.password_min_length,
                'max_login_attempts': setting.max_login_attempts,
                'lockout_duration_minutes': setting.lockout_duration_minutes,
                'admin_security_alerts': setting.admin_security_alerts,
                'admin_alert_email': setting.admin_alert_email,
            }
        })

    def patch(self, request):
        setting = PlatformSetting.get_instance()
        allowed_fields = [
            'platform_name',
            'support_email',
            'currency',
            'timezone',
            'language',
            'date_format',
            'staff_mfa_policy',
            'session_timeout_minutes',
            'customer_registration',
            'registration_message',
            'maintenance_mode',
            'maintenance_message',
            'maintenance_scheduled_start',
            'maintenance_scheduled_end',
            'password_min_length',
            'max_login_attempts',
            'lockout_duration_minutes',
            'admin_security_alerts',
            'admin_alert_email',
        ]
        updated_fields = []
        for field in allowed_fields:
            if field in request.data:
                raw_val = request.data[field]
                if field == 'support_email':
                    val = str(raw_val or '').strip()
                    if '@' not in val:
                        return Response({'error': 'A valid support email is required.'}, status=status.HTTP_400_BAD_REQUEST)
                    setattr(setting, field, val)
                elif field == 'platform_name':
                    val = str(raw_val or '').strip()
                    if not val:
                        return Response({'error': 'Platform name cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
                    setattr(setting, field, val)
                elif field == 'admin_alert_email':
                    val = str(raw_val or '').strip()
                    if val and '@' not in val:
                        return Response({'error': 'A valid admin alert email is required.'}, status=status.HTTP_400_BAD_REQUEST)
                    setattr(setting, field, val)
                elif field in {'password_min_length', 'max_login_attempts', 'lockout_duration_minutes'}:
                    try:
                        int_val = int(raw_val)
                        if field == 'password_min_length' and not (8 <= int_val <= 64):
                            return Response({'error': 'Password minimum length must be between 8 and 64 characters.'}, status=status.HTTP_400_BAD_REQUEST)
                        if field == 'max_login_attempts' and not (1 <= int_val <= 50):
                            return Response({'error': 'Max login attempts must be between 1 and 50.'}, status=status.HTTP_400_BAD_REQUEST)
                        if field == 'lockout_duration_minutes' and not (1 <= int_val <= 1440):
                            return Response({'error': 'Lockout duration must be between 1 and 1440 minutes.'}, status=status.HTTP_400_BAD_REQUEST)
                        setattr(setting, field, int_val)
                    except (ValueError, TypeError):
                        return Response({'error': f'{field} must be a valid integer.'}, status=status.HTTP_400_BAD_REQUEST)
                elif field in {'maintenance_scheduled_start', 'maintenance_scheduled_end'}:
                    if raw_val:
                        dt = parse_datetime(str(raw_val))
                        if not dt:
                            return Response({'error': f'{field} must be a valid ISO datetime.'}, status=status.HTTP_400_BAD_REQUEST)
                        if timezone.is_naive(dt):
                            dt = timezone.make_aware(dt)
                        setattr(setting, field, dt)
                    else:
                        setattr(setting, field, None)
                else:
                    val = str(raw_val or '').strip()
                    if field == 'date_format' and val not in ALLOWED_DATE_FORMATS:
                        return Response(
                            {'error': 'Choose a supported date format.', 'code': 'invalid_date_format'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    setattr(setting, field, val)
                updated_fields.append(field)

        if updated_fields:
            summary = ', '.join(updated_fields)
            action = f"Updated platform settings ({summary})"
            if len(action) > 255:
                action = f"Updated platform settings ({len(updated_fields)} fields)"
            with transaction.atomic():
                setting.save()
                _audit(request, action, "PlatformSetting", setting.id)

        return self.get(request)


class AdminHealthAPIView(AdminAPIView):
    def get(self, request):
        import time
        now = timezone.now()

        # Database Check
        t0 = time.monotonic()
        try:
            AccountsCustomer.objects.filter(role='admin').exists()
            db_latency_ms = round((time.monotonic() - t0) * 1000, 2)
            db_status = 'healthy'
        except Exception:
            db_latency_ms = round((time.monotonic() - t0) * 1000, 2)
            db_status = 'unavailable'

        # Email Check (Brevo)
        brevo_ready = is_brevo_configured()
        sender_name, sender_email = get_sender_identity()
        email_status = 'ready' if brevo_ready else 'unconfigured'

        # Payment Provider Check (PayMongo)
        try:
            from orders.capabilities import provider_configured, enabled_hosted_methods
            pm_ready = provider_configured()
            pm_mode = getattr(settings, 'PAYMONGO_MODE', 'test')
            pm_methods = enabled_hosted_methods()
        except Exception:
            pm_ready = False
            pm_mode = 'unknown'
            pm_methods = []

        overall = 'healthy'
        if db_status != 'healthy':
            overall = 'unavailable'
        elif not brevo_ready or not pm_ready:
            overall = 'degraded'

        return Response({
            'health': {
                'status': overall,
                'timestamp': now.isoformat(),
                'database': {
                    'status': db_status,
                    'latency_ms': db_latency_ms,
                },
                'transactional_email': {
                    'status': email_status,
                    'provider': 'brevo',
                    'sender_name': sender_name,
                    'sender_email_configured': bool(sender_email),
                },
                'payment_provider': {
                    'status': 'ready' if pm_ready else 'unconfigured',
                    'provider': 'paymongo',
                    'mode': pm_mode,
                    'enabled_hosted_methods': pm_methods,
                },
                'environment': {
                    'debug': getattr(settings, 'DEBUG', False),
                    'is_render': getattr(settings, 'IS_RENDER', False),
                }
            }
        })


class AdminUserResetPasswordAPIView(AdminAPIView):
    def post(self, request, pk):
        try:
            user = AccountsCustomer.objects.get(pk=pk)
        except AccountsCustomer.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not user.is_active:
            return Response({
                'error': 'Cannot reset password for an inactive or suspended account. Reactivate the account first.',
                'code': 'account_inactive',
            }, status=status.HTTP_400_BAD_REQUEST)

        # Check if delivery is configured
        if not is_brevo_configured():
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

        # Invalidate previous unused reset tokens
        PasswordResetToken.objects.filter(customer=user, consumed_at__isnull=True).update(consumed_at=timezone.now())

        # Generate new cryptographically secure token
        token_obj, raw_token = PasswordResetToken.issue(
            customer=user,
            purpose='reset',
            created_by=request.user,
        )
        reset_url = build_reset_url(raw_token, role=user.role)
        email_data = render_admin_password_reset(user, reset_url)
        send_res = send_transactional_email(
            user.email,
            user.name,
            email_data['subject'],
            email_data['html'],
            email_data['text'],
        )

        if not send_res.get('success'):
            _audit(
                request,
                f"Failed to deliver password reset email to user #{user.id} ({user.email}): {send_res.get('error')}",
                'AccountsCustomer',
                user.id,
            )
            return Response({
                'error': send_res.get('error') or 'Email delivery failed.',
                'code': send_res.get('code') or 'email_delivery_failed',
            }, status=status.HTTP_502_BAD_GATEWAY)

        _audit(
            request,
            f"Initiated password reset for {user.role} #{user.id} ({user.email})",
            'AccountsCustomer',
            user.id,
        )
        return Response({
            'message': f"Password reset instructions have been sent to {user.email}.",
            'success': True,
            'email': user.email,
        })


class AdminUserResendInviteAPIView(AdminAPIView):
    def post(self, request, pk):
        try:
            user = AccountsCustomer.objects.get(pk=pk)
        except AccountsCustomer.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not user.is_active:
            return Response({
                'error': 'Cannot send invitation to an inactive or suspended account.',
                'code': 'account_inactive',
            }, status=status.HTTP_400_BAD_REQUEST)

        if not is_brevo_configured():
            return Response({
                'error': 'Email delivery is not configured. A Brevo API key is required.',
                'code': 'reset_delivery_unconfigured',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Invalidate previous unused setup tokens
        PasswordResetToken.objects.filter(customer=user, consumed_at__isnull=True).update(consumed_at=timezone.now())

        token_obj, raw_token = PasswordResetToken.issue(
            customer=user,
            purpose='setup',
            created_by=request.user,
        )
        setup_url = build_reset_url(raw_token, role=user.role)
        email_data = render_welcome_setup(user, setup_url)
        send_res = send_transactional_email(
            user.email,
            user.name,
            email_data['subject'],
            email_data['html'],
            email_data['text'],
        )

        if not send_res.get('success'):
            return Response({
                'error': send_res.get('error') or 'Failed to send invitation.',
                'code': send_res.get('code') or 'email_delivery_failed',
            }, status=status.HTTP_502_BAD_GATEWAY)

        _audit(
            request,
            f"Resent setup invitation for {user.role} #{user.id} ({user.email})",
            'AccountsCustomer',
            user.id,
        )
        return Response({
            'message': f"Account setup invitation resent to {user.email}.",
            'success': True,
            'email': user.email,
        })


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
