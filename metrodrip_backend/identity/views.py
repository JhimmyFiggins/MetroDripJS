from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from .models import AccountsWishlistItem, AccountsCustomer, AuditLog, CustomerAccessToken
from catalog.models import CatalogProduct
from django.utils import timezone
from .authentication import CustomerAuthentication, CustomerTokenAuthentication
from .permissions import IsAdminRole, IsMerchantOrAdminRole
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

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

        wishlist = AccountsWishlistItem.objects.filter(
            customer=customer
        ).order_by('-created_at')

        data = []
        for item in wishlist:
            product = CatalogProduct.objects.filter(id=item.product_ref).first()
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
        if new_email and new_email.strip() != customer.email:
            existing = AccountsCustomer.objects.filter(email=new_email.strip()).exclude(id=customer.id).first()
            if existing:
                return Response({'error': 'An account with this email already exists.'}, status=400)
            customer.email = new_email.strip()

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
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        email = (request.data.get('email') or '').strip()

        if not email:
            return Response({'error': 'Email is required.'}, status=400)

        return Response({
            'error': 'Password-reset delivery is not configured. No reset token was generated or sent.',
            'code': 'reset_delivery_unconfigured',
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

class LoginAPIView(APIView):
    renderer_classes = [JSONRenderer]
    throttle_classes = [ScopedRateThrottle]
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
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'signup'

    def post(self, request):
        name = request.data.get('name')
        email = request.data.get('email')
        password = request.data.get('password')

        if not name or not email or not password:
            return Response(
                {'error': 'Name, email, and password are required.'},
                status=400
            )

        if AccountsCustomer.objects.filter(email=email).exists():
            return Response(
                {'error': 'An account with this email already exists.'},
                status=400
            )

        customer = AccountsCustomer(
            name=name,
            email=email.strip().lower(),
            phone='',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=timezone.now(),
        )
        customer.set_password(password)
        customer.save()

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

        # 2. Match confirmation
        if new_password != confirm_password:
            return Response({'error': 'Password confirmation does not match.'}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Disallow easily guessable/compromised values
        prohibited_words = ['password', '12345678', 'metrodrip', customer.name.lower(), customer.email.lower().split('@')[0]]
        for word in prohibited_words:
            if word and len(word) >= 4 and word in new_password.lower():
                return Response({
                    'error': f'Password contains easily guessable term "{word}". Please choose a stronger passphrase per NIST SP 800-63B.'
                }, status=status.HTTP_400_BAD_REQUEST)

        customer.set_password(new_password)
        customer.save(update_fields=['password'])
        CustomerAccessToken.objects.filter(customer=customer).exclude(pk=request.auth.pk).update(
            revoked_at=timezone.now()
        )

        try:
            AuditLog.objects.create(
                actor=customer.name,
                actor_role=customer.role,
                action='Rotated account password (NIST SP 800-63B compliant)',
                target_model='AccountsCustomer',
                target_id=str(customer.id),
            )
        except Exception:
            pass

        return Response({
            'success': True,
            'message': 'Password rotated successfully.',
        }, status=status.HTTP_200_OK)


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
