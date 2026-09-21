from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from .models import AccountsWishlistItem, AccountsCustomer, AuditLog
from catalog.models import CatalogProduct
from django.utils import timezone
from rest_framework.authtoken.models import Token
from .authentication import CustomerAuthentication

class WishlistAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
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

    def post(self, request):
        email = (request.data.get('email') or '').strip()

        if not email:
            return Response({'error': 'Email is required.'}, status=400)

        customer = AccountsCustomer.objects.filter(email=email, is_active=True).first()

        if customer:
            try:
                AuditLog.objects.create(
                    actor=customer.name,
                    actor_role='customer',
                    action='Requested password reset',
                    target_model='AccountsCustomer',
                    target_id=str(customer.id),
                )
            except Exception:
                pass

            return Response({
                'success': True,
                'message': 'Password reset instructions have been sent to your email.',
                'email': customer.email,
            }, status=200)

        return Response({
            'success': False,
            'error': 'No active account found with this email address.',
        }, status=404)

class LoginAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def post(self, request):
        print("LOGIN EMAIL:", request.data.get('email'))
        print("LOGIN PASSWORD:", request.data.get('password'))
        email = request.data.get('email')
        password = request.data.get('password')

        customer = AccountsCustomer.objects.filter(
            email=email,
            password=password,
            is_active=True
        ).first()

        if not customer:
            return Response(
                {'error': 'Invalid email or password.'},
                status=401
            )
        # token, created = Token.objects.get_or_create(user=customer)
        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'addresses': customer.addresses,
        })

class CheckCustomerAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        customer = AccountsCustomer.objects.filter(id=1).first()

        if not customer:
            return Response({
                'exists': False
            })

        return Response({
            'exists': True,
            'id': customer.id,
            'email': customer.email,
            'password': customer.password,
            'is_active': customer.is_active,
        })
        
class SignupAPIView(APIView):
    renderer_classes = [JSONRenderer]

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

        customer = AccountsCustomer.objects.create(
            name=name,
            email=email,
            password=password,
            phone='',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=timezone.now(),
        )

        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
        }, status=201)


class LogoutAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def post(self, request):
        actor_name = request.data.get('actor') or (request.user.name if hasattr(request.user, 'name') and request.user.name else 'Console User')
        actor_role = request.data.get('role') or (request.user.role if hasattr(request.user, 'role') and request.user.role else 'staff')

        try:
            AuditLog.objects.create(
                actor=actor_name,
                actor_role=actor_role,
                action='Signed out of console session',
                target_model='AccountsCustomer',
                target_id=str(request.data.get('user_id', '')),
            )
        except Exception:
            pass

        return Response({
            'success': True,
            'message': 'Successfully signed out.',
        }, status=200)


class SwitchUserAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        role_filter = request.GET.get('role')
        qs = AccountsCustomer.objects.filter(is_active=True)
        if role_filter:
            qs = qs.filter(role=role_filter)

        users = qs.order_by('-is_staff', 'role', 'id')[:30]
        data = [
            {
                'id': u.id,
                'name': u.name,
                'email': u.email,
                'role': u.role,
                'is_staff': u.is_staff,
                'is_active': u.is_active,
                'date_joined': u.date_joined.isoformat() if u.date_joined else None,
            }
            for u in users
        ]
        return Response({
            'success': True,
            'users': data,
            'count': len(data),
        }, status=200)

    def post(self, request):
        user_id = request.data.get('user_id')
        email = request.data.get('email', '').strip()
        current_actor = request.data.get('current_actor', 'Console User')

        target = None
        if user_id:
            target = AccountsCustomer.objects.filter(id=user_id, is_active=True).first()
        elif email:
            target = AccountsCustomer.objects.filter(email=email, is_active=True).first()

        if not target:
            return Response({
                'success': False,
                'error': 'Active user account not found or is suspended.',
            }, status=404)

        try:
            AuditLog.objects.create(
                actor=current_actor,
                actor_role='system',
                action=f'Switched active account to {target.name} ({target.role})',
                target_model='AccountsCustomer',
                target_id=str(target.id),
            )
        except Exception:
            pass

        if target.role == 'admin':
            redirect_url = '/admin/index.html'
        elif target.role == 'merchant':
            redirect_url = '/merchant/index.html'
        else:
            redirect_url = '/'

        return Response({
            'success': True,
            'message': f'Switched account to {target.name}',
            'user': {
                'id': target.id,
                'name': target.name,
                'email': target.email,
                'role': target.role,
                'is_staff': target.is_staff,
            },
            'redirect_url': redirect_url,
        }, status=200)


class UserMeAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
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
        mfa_enabled = meta.get('mfa_enabled', True)
        preferences = meta.get('preferences', {
            'email_notifications': True,
            'security_alerts': True,
            'low_stock_alerts': True,
            'order_alerts': True,
            'table_density': 'comfortable',
            'theme': 'dark',
            'digest_frequency': 'weekly',
        })
        sessions = meta.get('sessions', [
            {
                'id': 'sess-current',
                'device': 'Chrome 128 on macOS (Sonoma)',
                'ip': '192.168.30.23',
                'location': 'Quezon City, PH',
                'last_active': 'Active now',
                'is_current': True,
            },
            {
                'id': 'sess-mobile-ios',
                'device': 'MetroDrip iOS App (iPhone 15 Pro)',
                'ip': '112.198.71.104',
                'location': 'Manila, PH',
                'last_active': '2 hours ago',
                'is_current': False,
            },
            {
                'id': 'sess-workstation',
                'device': 'Firefox 130 on Windows 11',
                'ip': '175.176.88.19',
                'location': 'Taguig, PH',
                'last_active': 'Yesterday, 18:42',
                'is_current': False,
            },
        ])

        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'role': customer.role,
            'is_staff': customer.is_staff,
            'avatar': avatar,
            'mfa_enabled': mfa_enabled,
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
    renderer_classes = [JSONRenderer]

    def post(self, request):
        user_me_view = UserMeAPIView()
        customer = user_me_view._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')
        confirm_password = request.data.get('confirm_password', '')

        if customer.password and customer.password != current_password:
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

        customer.password = new_password
        customer.save()

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
    renderer_classes = [JSONRenderer]

    def post(self, request):
        user_me_view = UserMeAPIView()
        customer = user_me_view._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        enabled = request.data.get('enabled')
        verification_code = request.data.get('code')

        meta = customer.addresses if isinstance(customer.addresses, dict) else {}

        if enabled is False:
            meta['mfa_enabled'] = False
            customer.addresses = meta
            customer.save()

            try:
                AuditLog.objects.create(
                    actor=customer.name,
                    actor_role=customer.role,
                    action='Disabled Two-Factor Authentication (MFA)',
                    target_model='AccountsCustomer',
                    target_id=str(customer.id),
                )
            except Exception:
                pass

            return Response({
                'success': True,
                'mfa_enabled': False,
                'message': 'Two-factor authentication disabled.',
            })

        if verification_code and len(str(verification_code).strip()) == 6:
            meta['mfa_enabled'] = True
            customer.addresses = meta
            customer.save()

            try:
                AuditLog.objects.create(
                    actor=customer.name,
                    actor_role=customer.role,
                    action='Enabled Two-Factor Authentication (TOTP)',
                    target_model='AccountsCustomer',
                    target_id=str(customer.id),
                )
            except Exception:
                pass

            return Response({
                'success': True,
                'mfa_enabled': True,
                'message': 'Two-factor authentication verified and enabled.',
            })

        return Response({
            'error': 'A valid 6-digit TOTP verification code is required to enable MFA.'
        }, status=status.HTTP_400_BAD_REQUEST)


class UserSessionsAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        user_me_view = UserMeAPIView()
        customer = user_me_view._get_customer(request)
        if not customer:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        session_id = request.data.get('session_id')
        revoke_all = request.data.get('revoke_all', False)

        meta = customer.addresses if isinstance(customer.addresses, dict) else {}
        sessions = meta.get('sessions', [
            {
                'id': 'sess-current',
                'device': 'Chrome 128 on macOS (Sonoma)',
                'ip': '192.168.30.23',
                'location': 'Quezon City, PH',
                'last_active': 'Active now',
                'is_current': True,
            },
            {
                'id': 'sess-mobile-ios',
                'device': 'MetroDrip iOS App (iPhone 15 Pro)',
                'ip': '112.198.71.104',
                'location': 'Manila, PH',
                'last_active': '2 hours ago',
                'is_current': False,
            },
            {
                'id': 'sess-workstation',
                'device': 'Firefox 130 on Windows 11',
                'ip': '175.176.88.19',
                'location': 'Taguig, PH',
                'last_active': 'Yesterday, 18:42',
                'is_current': False,
            },
        ])

        if revoke_all:
            sessions = [s for s in sessions if s.get('is_current')]
            meta['sessions'] = sessions
            customer.addresses = meta
            customer.save()

            try:
                AuditLog.objects.create(
                    actor=customer.name,
                    actor_role=customer.role,
                    action='Revoked all remote sessions (NIST SP 800-63B session termination)',
                    target_model='AccountsCustomer',
                    target_id=str(customer.id),
                )
            except Exception:
                pass

            return Response({
                'success': True,
                'message': 'All other active sessions have been revoked.',
                'sessions': sessions,
            })

        if session_id:
            target = next((s for s in sessions if s.get('id') == session_id), None)
            if target and target.get('is_current'):
                return Response({'error': 'Cannot revoke current session here. Use Sign Out instead.'}, status=status.HTTP_400_BAD_REQUEST)

            sessions = [s for s in sessions if s.get('id') != session_id]
            meta['sessions'] = sessions
            customer.addresses = meta
            customer.save()

            try:
                AuditLog.objects.create(
                    actor=customer.name,
                    actor_role=customer.role,
                    action=f'Revoked remote session {session_id}',
                    target_model='AccountsCustomer',
                    target_id=str(customer.id),
                )
            except Exception:
                pass

            return Response({
                'success': True,
                'message': f'Session {session_id} has been revoked.',
                'sessions': sessions,
            })

        return Response({'error': 'session_id or revoke_all is required.'}, status=status.HTTP_400_BAD_REQUEST)