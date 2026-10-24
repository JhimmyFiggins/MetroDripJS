from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from .models import (
    AccountsWishlistItem,
    AccountsCustomer,
    AuditLog,
    CustomerAccessToken,
    PasswordResetToken,
    PlatformSetting,
)
from catalog.models import CatalogProduct
from django.utils import timezone
from .authentication import CustomerAuthentication, CustomerTokenAuthentication
from .permissions import IsAdminRole, IsMerchantOrAdminRole
from rest_framework.permissions import IsAuthenticated
from .throttling import DatabaseScopedRateThrottle
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from .brevo import (
    is_brevo_configured,
    build_reset_url,
    send_transactional_email,
)
from .email_templates import (
    render_self_service_password_reset,
    render_password_changed_notification,
)


def _obfuscate_email(email):
    if not email or '@' not in email:
        return '***'
    user_part, _, domain = email.partition('@')
    if len(user_part) <= 2:
        masked_user = user_part[0] + '*'
    else:
        masked_user = user_part[0] + '*' * (len(user_part) - 2) + user_part[-1]
    return f"{masked_user}@{domain}"


class WishlistAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def _get_customer(self, request):
        if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and isinstance(request.user, AccountsCustomer):
            return request.user

        customer_id = (
            request.headers.get('X-Customer-ID')
            or request.headers.get('x-customer-id')
            or request.META.get('HTTP_X_CUSTOMER_ID')
            or (request.query_params.get('customer_id') if hasattr(request, 'query_params') else None)
            or (request.GET.get('customer_id') if hasattr(request, 'GET') else None)
            or (request.data.get('customer_id') if hasattr(request, 'data') else None)
        )
        if customer_id:
            try:
                return AccountsCustomer.objects.filter(id=int(customer_id), is_active=True).first()
            except (ValueError, TypeError):
                pass
        return None

    def get(self, request):
        customer = self._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=401)

        wishlist = list(AccountsWishlistItem.objects.filter(
            customer=customer
        ).order_by('-created_at'))

        products = CatalogProduct.objects.filter(
            id__in={item.product_ref for item in wishlist},
            is_active=True,
        ).in_bulk()

        data = []
        for item in wishlist:
            product = products.get(item.product_ref)
            if product:
                data.append({
                    'id': item.id,
                    'product_ref': item.product_ref,
                    'name': product.name,
                    'price': str(product.base_price),
                    'image_url': product.image_url,
                    'created_at': item.created_at,
                })

        return Response(data)

    def post(self, request):
        customer = self._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=401)

        product_ref = request.data.get('product_ref') or request.data.get('id')
        if not product_ref:
            return Response(
                {'error': 'product_ref is required'},
                status=400
            )

        try:
            product_ref = int(product_ref)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid product reference.'}, status=400)

        if not CatalogProduct.objects.filter(id=product_ref, is_active=True).exists():
            return Response({'error': 'Product not found.'}, status=404)

        wishlist_item, created = AccountsWishlistItem.objects.get_or_create(
            customer=customer,
            product_ref=product_ref,
            defaults={'created_at': timezone.now()},
        )

        return Response({
            'id': wishlist_item.id,
            'product_ref': wishlist_item.product_ref,
            'created': created,
        }, status=201)

    def delete(self, request):
        customer = self._get_customer(request)
        wishlist_id = request.data.get('id') if hasattr(request, 'data') else None
        if not wishlist_id and hasattr(request, 'query_params'):
            wishlist_id = request.query_params.get('id')
        elif not wishlist_id and hasattr(request, 'GET'):
            wishlist_id = request.GET.get('id')

        product_ref = request.data.get('product_ref') if hasattr(request, 'data') else None
        if not product_ref and hasattr(request, 'query_params'):
            product_ref = request.query_params.get('product_ref')
        elif not product_ref and hasattr(request, 'GET'):
            product_ref = request.GET.get('product_ref')

        if not wishlist_id and not product_ref:
            return Response(
                {'error': 'id or product_ref is required'},
                status=400
            )

        qs = AccountsWishlistItem.objects.all()
        if customer:
            qs = qs.filter(customer=customer)

        if wishlist_id:
            try:
                qs = qs.filter(id=int(wishlist_id))
            except (ValueError, TypeError):
                return Response({'error': 'Invalid wishlist item ID.'}, status=400)
        elif product_ref:
            try:
                qs = qs.filter(product_ref=int(product_ref))
            except (ValueError, TypeError):
                return Response({'error': 'Invalid product reference.'}, status=400)

        deleted, _ = qs.delete()
        if deleted == 0:
            return Response(
                {'error': 'Wishlist item not found'},
                status=404
            )

        return Response(
            {'message': 'Wishlist item removed'},
            status=200
        )

class ProfileAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def _get_customer(self, request):
        if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and isinstance(request.user, AccountsCustomer):
            return request.user

        customer_id = (
            request.headers.get('X-Customer-ID')
            or request.headers.get('x-customer-id')
            or request.META.get('HTTP_X_CUSTOMER_ID')
            or (request.query_params.get('customer_id') if hasattr(request, 'query_params') else None)
            or (request.GET.get('customer_id') if hasattr(request, 'GET') else None)
            or (request.data.get('customer_id') if hasattr(request, 'data') else None)
            or (request.data.get('id') if hasattr(request, 'data') else None)
        )
        if customer_id:
            try:
                return AccountsCustomer.objects.filter(id=int(customer_id), is_active=True).first()
            except (ValueError, TypeError):
                pass

        email = (request.data.get('email') if hasattr(request, 'data') else None) or (
            request.query_params.get('email') if hasattr(request, 'query_params') else None
        )
        if email:
            return AccountsCustomer.objects.filter(email=email.strip(), is_active=True).first()

        return None

    def get(self, request):
        customer = self._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=401)

        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'addresses': customer.addresses,
            'role': customer.role,
        })

    def put(self, request):
        customer = self._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=401)

        customer.name = request.data.get('name', customer.name)
        new_email = request.data.get('email')
        normalized_email = new_email.strip().lower() if isinstance(new_email, str) else ''
        if normalized_email and normalized_email != customer.email:
            existing = AccountsCustomer.objects.filter(email__iexact=normalized_email).exclude(id=customer.id).first()
            if existing:
                return Response({'error': 'An account with this email already exists.'}, status=400)
            customer.email = normalized_email

        customer.phone = request.data.get('phone', customer.phone)
        customer.addresses = request.data.get(
            'addresses',
            customer.addresses
        )

        customer.save()

        return Response({
            'message': 'Profile updated successfully.',
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'addresses': customer.addresses,
            'role': customer.role,
        })

class ForgotPasswordAPIView(APIView):
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        raw_email = (request.data.get('email') or '').strip()
        if not raw_email:
            return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        email = raw_email.lower()
        if '@' not in email or '.' not in email.split('@')[-1]:
            return Response({'error': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        # Do not claim a message was sent when the delivery subsystem is unavailable.
        if not is_brevo_configured():
            return Response({
                'error': 'Password recovery is temporarily unavailable. Please contact support.',
                'code': 'reset_delivery_unconfigured',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        customer = AccountsCustomer.objects.filter(email__iexact=email).first()
        if customer and customer.is_active:
            # Invalidate older pending reset tokens
            PasswordResetToken.objects.filter(customer=customer, consumed_at__isnull=True).update(consumed_at=timezone.now())

            token_obj, raw_token = PasswordResetToken.issue(
                customer=customer,
                purpose='reset',
            )
            reset_url = build_reset_url(raw_token, role=customer.role)
            email_data = render_self_service_password_reset(customer, reset_url)
            send_res = send_transactional_email(
                customer.email,
                customer.name,
                email_data['subject'],
                email_data['html'],
                email_data['text'],
            )
            if not send_res.get('success'):
                return Response({
                    'error': 'Failed to dispatch password recovery email. Please try again later.',
                    'code': 'email_delivery_failed',
                }, status=status.HTTP_502_BAD_GATEWAY)

        # Return neutral enumeration-safe response
        return Response({
            'message': 'If an eligible account is associated with this email, password reset instructions have been sent.',
            'success': True,
        }, status=status.HTTP_200_OK)


class PasswordResetVerifyAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        raw_token = (request.query_params.get('token') or request.GET.get('token') or '').strip()
        if not raw_token:
            return Response({
                'valid': False,
                'error': 'Reset token is required.',
                'code': 'token_missing',
            }, status=status.HTTP_400_BAD_REQUEST)

        digest = PasswordResetToken.digest(raw_token)
        token_obj = PasswordResetToken.objects.select_related('customer').filter(token_digest=digest).first()

        if not token_obj:
            return Response({
                'valid': False,
                'error': 'This password reset link is invalid.',
                'code': 'token_invalid',
            }, status=status.HTTP_400_BAD_REQUEST)

        if token_obj.consumed_at is not None:
            return Response({
                'valid': False,
                'error': 'This password reset link has already been used.',
                'code': 'token_already_used',
            }, status=status.HTTP_400_BAD_REQUEST)

        if token_obj.expires_at <= timezone.now():
            return Response({
                'valid': False,
                'error': 'This password reset link has expired. Please request a new one.',
                'code': 'token_expired',
            }, status=status.HTTP_400_BAD_REQUEST)

        if not token_obj.customer.is_active:
            return Response({
                'valid': False,
                'error': 'This account is suspended or inactive.',
                'code': 'account_inactive',
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'valid': True,
            'purpose': token_obj.purpose,
            'email': _obfuscate_email(token_obj.customer.email),
            'role': token_obj.customer.role,
        }, status=status.HTTP_200_OK)


class PasswordResetConfirmAPIView(APIView):
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        raw_token = (request.data.get('token') or '').strip()
        new_password = request.data.get('new_password', '')
        confirm_password = request.data.get('confirm_password', '')

        if not raw_token:
            return Response({
                'error': 'Reset token is required.',
                'code': 'token_missing',
            }, status=status.HTTP_400_BAD_REQUEST)

        if not new_password:
            return Response({
                'error': 'New password is required.',
                'code': 'password_required',
            }, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({
                'error': 'NIST SP 800-63B requirement: Password must be at least 8 characters long.',
                'code': 'password_too_short',
            }, status=status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return Response({
                'error': 'Password confirmation does not match.',
                'code': 'password_mismatch',
            }, status=status.HTTP_400_BAD_REQUEST)

        digest = PasswordResetToken.digest(raw_token)

        with transaction.atomic():
            token_obj = (
                PasswordResetToken.objects
                .select_for_update()
                .select_related('customer')
                .filter(token_digest=digest)
                .first()
            )

            if not token_obj:
                return Response({
                    'error': 'This password reset link is invalid.',
                    'code': 'token_invalid',
                }, status=status.HTTP_400_BAD_REQUEST)

            if token_obj.consumed_at is not None:
                return Response({
                    'error': 'This password reset link has already been used.',
                    'code': 'token_already_used',
                }, status=status.HTTP_400_BAD_REQUEST)

            now = timezone.now()
            if token_obj.expires_at <= now:
                return Response({
                    'error': 'This password reset link has expired. Please request a new one.',
                    'code': 'token_expired',
                }, status=status.HTTP_400_BAD_REQUEST)

            customer = token_obj.customer
            if not customer.is_active:
                return Response({
                    'error': 'This account is suspended or inactive.',
                    'code': 'account_inactive',
                }, status=status.HTTP_400_BAD_REQUEST)

            # Check guessable terms
            prohibited_words = [
                'password', '12345678', 'metrodrip',
                (customer.name or '').lower(),
                customer.email.lower().split('@')[0],
            ]
            for word in prohibited_words:
                if word and len(word) >= 4 and word in new_password.lower():
                    return Response({
                        'error': f'Password contains easily guessable term "{word}". Please choose a stronger passphrase per NIST SP 800-63B.',
                        'code': 'password_guessable',
                    }, status=status.HTTP_400_BAD_REQUEST)

            try:
                validate_password(new_password, user=customer)
            except ValidationError as err:
                return Response({
                    'error': list(err.messages)[0],
                    'code': 'password_policy_failed',
                }, status=status.HTTP_400_BAD_REQUEST)

            # Atomically update password and consume token
            customer.set_password(new_password)
            customer.password_change_required = False
            customer.save(update_fields=['password', 'password_change_required'])

            token_obj.consumed_at = now
            token_obj.save(update_fields=['consumed_at'])

            # Invalidate all remaining unused tokens for this user
            PasswordResetToken.objects.filter(
                customer=customer,
                consumed_at__isnull=True,
            ).update(consumed_at=now)

            # Revoke all active bearer sessions
            CustomerAccessToken.objects.filter(
                customer=customer,
                revoked_at__isnull=True,
            ).update(revoked_at=now)

            try:
                AuditLog.objects.create(
                    actor=customer.name or customer.email,
                    actor_role=customer.role,
                    action=f"Reset password via token (purpose: {token_obj.purpose})",
                    target_model='AccountsCustomer',
                    target_id=str(customer.id),
                )
            except Exception:
                pass

        # Send security notification if configured
        if is_brevo_configured():
            notif = render_password_changed_notification(
                customer,
                now.strftime('%Y-%m-%d %H:%M UTC'),
            )
            send_transactional_email(
                customer.email,
                customer.name,
                notif['subject'],
                notif['html'],
                notif['text'],
            )

        return Response({
            'message': 'Password has been set successfully. You can now sign in with your new password.',
            'success': True,
            'role': customer.role,
        }, status=status.HTTP_200_OK)


class LoginAPIView(APIView):
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        password = request.data.get('password') or ''
        customer = AccountsCustomer.objects.filter(email__iexact=email, is_active=True).first()

        if not customer or not customer.check_password(password):
            return Response(
                {'error': 'Invalid email or password.'},
                status=401
            )

        # Upgrade legacy plaintext values only after the submitted password has
        # matched, so existing accounts migrate without a disruptive reset.
        if not customer.password.startswith(('pbkdf2_', 'argon2$', 'bcrypt$', 'scrypt$')):
            customer.set_password(password)
            customer.last_login = timezone.now()
            customer.save(update_fields=['password', 'last_login'])
        else:
            customer.last_login = timezone.now()
            customer.save(update_fields=['last_login'])

        token, raw_token = CustomerAccessToken.issue(customer)
        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'addresses': customer.addresses,
            'access_token': raw_token,
            'token': raw_token,
            'token_type': 'Bearer',
            'expires_at': token.expires_at.isoformat(),
            'role': customer.role,
            'is_staff': customer.is_staff,
            'password_change_required': customer.password_change_required,
        })

class CheckCustomerAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        return Response({
            'error': 'This account-discovery endpoint has been retired.',
            'code': 'account_discovery_retired',
        }, status=status.HTTP_410_GONE)

class SignupAPIView(APIView):
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'signup'

    def post(self, request):
        setting = PlatformSetting.get_instance()
        if getattr(setting, 'customer_registration', 'enabled') == 'disabled':
            msg = getattr(setting, 'registration_message', '') or 'New customer registration is currently paused.'
            return Response(
                {
                    'error': msg,
                    'code': 'registration_disabled',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        name = (request.data.get('name') or '').strip()
        email = (request.data.get('email') or '').strip().lower()
        password = request.data.get('password')

        if not name or not email or not password:
            return Response(
                {'error': 'Name, email, and password are required.'},
                status=400
            )

        if AccountsCustomer.objects.filter(email__iexact=email).exists():
            return Response(
                {'error': 'An account with this email already exists.'},
                status=400
            )

        customer = AccountsCustomer(
            name=name,
            email=email,
            phone='',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=timezone.now(),
        )
        try:
            validate_password(password, user=customer)
        except ValidationError as error:
            return Response({'password': list(error.messages)}, status=400)

        customer.set_password(password)
        try:
            with transaction.atomic():
                customer.save()
        except IntegrityError:
            return Response(
                {'error': 'An account with this email already exists.'},
                status=400,
            )

        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
        }, status=201)


class LogoutAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsMerchantOrAdminRole]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        AuditLog.objects.create(
            actor=request.user.name or request.user.email,
            actor_role=request.user.role,
            action='Signed out of console session',
            target_model='AccountsCustomer',
            target_id=str(request.user.id),
        )
        request.auth.revoked_at = timezone.now()
        request.auth.save(update_fields=['revoked_at'])

        return Response({
            'success': True,
            'message': 'Successfully signed out.',
        }, status=200)


class CustomerLogoutAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        request.auth.revoked_at = timezone.now()
        request.auth.save(update_fields=['revoked_at'])
        return Response({'success': True, 'message': 'Successfully signed out.'}, status=200)


class SwitchUserAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAdminRole]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        return Response({
            'success': False,
            'error': 'Client-side account switching has been retired. Sign out and authenticate as the intended account.',
            'code': 'account_switching_retired',
        }, status=status.HTTP_410_GONE)

    def post(self, request):
        return Response({
            'success': False,
            'error': 'Client-side account switching has been retired. Sign out and authenticate as the intended account.',
            'code': 'account_switching_retired',
        }, status=status.HTTP_410_GONE)


def _active_session_data(customer, current_token=None):
    tokens = CustomerAccessToken.objects.filter(
        customer=customer,
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).order_by('-created_at')
    return [
        {
            'id': f'token-{token.id}',
            'device': 'Current authenticated client' if current_token and token.id == current_token.id else 'Authenticated client',
            'ip': None,
            'location': None,
            'created_at': token.created_at.isoformat(),
            'last_active': (token.last_used_at or token.created_at).isoformat(),
            'expires_at': token.expires_at.isoformat(),
            'is_current': bool(current_token and token.id == current_token.id),
        }
        for token in tokens
    ]


class UserMeAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def _get_customer(self, request):
        if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and isinstance(request.user, AccountsCustomer):
            return request.user

        customer_id = (
            request.headers.get('X-Customer-ID')
            or request.headers.get('x-customer-id')
            or request.META.get('HTTP_X_CUSTOMER_ID')
            or (request.query_params.get('customer_id') if hasattr(request, 'query_params') else None)
            or (request.GET.get('customer_id') if hasattr(request, 'GET') else None)
            or (request.data.get('customer_id') if hasattr(request, 'data') and isinstance(request.data, dict) else None)
            or (request.data.get('id') if hasattr(request, 'data') and isinstance(request.data, dict) else None)
        )
        if customer_id:
            try:
                return AccountsCustomer.objects.filter(id=int(customer_id), is_active=True).first()
            except (ValueError, TypeError):
                pass

        email = (request.data.get('email') if hasattr(request, 'data') and isinstance(request.data, dict) else None) or (
            request.query_params.get('email') if hasattr(request, 'query_params') else None
        )
        if email:
            return AccountsCustomer.objects.filter(email=email.strip(), is_active=True).first()

        return None

    def get(self, request):
        customer = self._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        meta = customer.addresses if isinstance(customer.addresses, dict) else {}
        avatar = meta.get('avatar', '')
        preferences = meta.get('preferences', {
            'email_notifications': True,
            'security_alerts': True,
            'low_stock_alerts': True,
            'order_alerts': True,
            'table_density': 'comfortable',
            'theme': 'dark',
            'digest_frequency': 'weekly',
        })
        sessions = _active_session_data(customer, request.auth)

        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'role': customer.role,
            'is_staff': customer.is_staff,
            'avatar': avatar,
            'mfa_enabled': False,
            'mfa_available': False,
            'preferences': preferences,
            'sessions': sessions,
            'addresses': customer.addresses,
        }, status=status.HTTP_200_OK)

    def put(self, request):
        customer = self._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        if 'name' in request.data and request.data['name']:
            customer.name = str(request.data['name']).strip()

        new_email = request.data.get('email')
        if new_email and new_email.strip() != customer.email:
            existing = AccountsCustomer.objects.filter(email=new_email.strip()).exclude(id=customer.id).first()
            if existing:
                return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)
            customer.email = new_email.strip()

        if 'phone' in request.data:
            customer.phone = str(request.data['phone']).strip()

        meta = customer.addresses if isinstance(customer.addresses, dict) else {}
        if 'avatar' in request.data:
            meta['avatar'] = request.data['avatar']
        if 'preferences' in request.data and isinstance(request.data['preferences'], dict):
            current_prefs = meta.get('preferences', {})
            current_prefs.update(request.data['preferences'])
            meta['preferences'] = current_prefs
        if 'addresses' in request.data and isinstance(request.data['addresses'], dict):
            meta.update(request.data['addresses'])

        customer.addresses = meta
        customer.save()

        try:
            AuditLog.objects.create(
                actor=customer.name,
                actor_role=customer.role,
                action='Updated user profile attributes via PUT /users/me',
                target_model='AccountsCustomer',
                target_id=str(customer.id),
            )
        except Exception:
            pass

        return Response({
            'message': 'Profile updated successfully.',
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'role': customer.role,
            'avatar': meta.get('avatar', ''),
            'preferences': meta.get('preferences', {}),
        }, status=status.HTTP_200_OK)


class UserPasswordAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        user_me_view = UserMeAPIView()
        customer = user_me_view._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')
        confirm_password = request.data.get('confirm_password', '')

        if customer.password and not customer.check_password(current_password):
            return Response({'error': 'Current password does not match.'}, status=status.HTTP_400_BAD_REQUEST)

        if not new_password:
            return Response({'error': 'New password is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. NIST SP 800-63B Minimum 8 characters
        if len(new_password) < 8:
            return Response({
                'error': 'NIST SP 800-63B requirement: Password must be at least 8 characters long.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 2. Match confirmation if supplied
        if confirm_password and new_password != confirm_password:
            return Response({'error': 'Password confirmation does not match.'}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Disallow easily guessable/compromised values
        prohibited_words = ['password', '12345678', 'metrodrip', customer.name.lower(), customer.email.lower().split('@')[0]]
        for word in prohibited_words:
            if word and len(word) >= 4 and word in new_password.lower():
                return Response({
                    'error': f'Password contains easily guessable term "{word}". Please choose a stronger passphrase per NIST SP 800-63B.'
                }, status=status.HTTP_400_BAD_REQUEST)

        customer.set_password(new_password)
        customer.password_change_required = False
        customer.save(update_fields=['password', 'password_change_required'])

        tokens_qs = CustomerAccessToken.objects.filter(customer=customer)
        auth_pk = getattr(request.auth, 'pk', None)
        if auth_pk:
            tokens_qs = tokens_qs.exclude(pk=auth_pk)
        tokens_qs.update(revoked_at=timezone.now())

        try:
            AuditLog.objects.create(
                actor=customer.name or customer.email,
                actor_role=customer.role,
                action='Rotated account password (NIST SP 800-63B compliant)',
                target_model='AccountsCustomer',
                target_id=str(customer.id),
            )
        except Exception:
            pass

        if is_brevo_configured():
            notif = render_password_changed_notification(
                customer,
                timezone.now().strftime('%Y-%m-%d %H:%M UTC'),
            )
            send_transactional_email(
                customer.email,
                customer.name,
                notif['subject'],
                notif['html'],
                notif['text'],
            )

        return Response({
            'success': True,
            'message': 'Password rotated successfully.',
            'password_change_required': False,
        }, status=status.HTTP_200_OK)

    def put(self, request):
        return self.post(request)

    def patch(self, request):
        return self.post(request)


class UserMfaAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        return Response({
            'error': 'Multi-factor authentication is not configured. No verification code was accepted.',
            'code': 'mfa_unconfigured',
        }, status=status.HTTP_501_NOT_IMPLEMENTED)


class UserSessionsAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        user_me_view = UserMeAPIView()
        customer = user_me_view._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        session_id = request.data.get('session_id')
        revoke_all = request.data.get('revoke_all', False)

        if revoke_all:
            CustomerAccessToken.objects.filter(customer=customer, revoked_at__isnull=True).exclude(
                pk=request.auth.pk
            ).update(revoked_at=timezone.now())
            AuditLog.objects.create(
                actor=customer.name,
                actor_role=customer.role,
                action='Revoked all other access tokens',
                target_model='CustomerAccessToken',
                target_id=str(customer.id),
            )

            return Response({
                'success': True,
                'message': 'All other active sessions have been revoked.',
                'sessions': _active_session_data(customer, request.auth),
            })

        if session_id:
            prefix = 'token-'
            if not isinstance(session_id, str) or not session_id.startswith(prefix) or not session_id[len(prefix):].isdigit():
                return Response({'error': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)
            target_id = int(session_id[len(prefix):])
            if target_id == request.auth.id:
                return Response({'error': 'Cannot revoke current session here. Use Sign Out instead.'}, status=status.HTTP_400_BAD_REQUEST)
            target = CustomerAccessToken.objects.filter(
                pk=target_id,
                customer=customer,
                revoked_at__isnull=True,
            ).first()
            if not target:
                return Response({'error': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)
            target.revoked_at = timezone.now()
            target.save(update_fields=['revoked_at'])
            AuditLog.objects.create(
                actor=customer.name,
                actor_role=customer.role,
                action=f'Revoked access token {target.id}',
                target_model='CustomerAccessToken',
                target_id=str(target.id),
            )

            return Response({
                'success': True,
                'message': f'Session {session_id} has been revoked.',
                'sessions': _active_session_data(customer, request.auth),
            })

        return Response({'error': 'session_id or revoke_all is required.'}, status=status.HTTP_400_BAD_REQUEST)
