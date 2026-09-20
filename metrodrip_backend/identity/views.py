from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.renderers import JSONRenderer
from .models import AccountsWishlistItem, AccountsCustomer, AuditLog
from catalog.models import CatalogProduct
from django.utils import timezone
from rest_framework.authtoken.models import Token
from .authentication import CustomerAuthentication

class WishlistAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        wishlist = AccountsWishlistItem.objects.filter(
            customer=request.user
        ).order_by('-created_at')

        data = []

        for item in wishlist:
            product = CatalogProduct.objects.filter(id=item.product_ref).first()

            if product:
                data.append({
                    'id': item.id,
                    'product_ref': item.product_ref,
                    'name': product.name,
                    'price': product.base_price,
                    'image_url': product.image_url,
                    'created_at': item.created_at,
                })

        return Response(data)

    def post(self, request):
        product_ref = request.data.get('product_ref')

        if not product_ref:
            return Response(
                {'error': 'product_ref is required'},
                status=400
            )

        wishlist_item = AccountsWishlistItem.objects.create(
            customer=request.user,
            product_ref=product_ref,
            created_at=timezone.now(),
        )

        return Response({
            'id': wishlist_item.id,
            'product_ref': wishlist_item.product_ref,
        }, status=201)

    def delete(self, request):
        wishlist_id = request.data.get('id')

        if not wishlist_id:
            return Response(
                {'error': 'id is required'},
                status=400
            )

        deleted, _ = AccountsWishlistItem.objects.filter(
            id=wishlist_id
        ).delete()

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

    def get(self, request):
        customer = request.user

        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'addresses': customer.addresses,
        })

    def put(self, request):
        customer = request.user

        customer.name = request.data.get('name', customer.name)
        customer.email = request.data.get('email', customer.email)
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
        })

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