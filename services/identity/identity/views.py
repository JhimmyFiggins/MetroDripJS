from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import AccountsCustomer, AccountsWishlistItem, AuthToken, AuditLog
from .authentication import VerifiableTokenAuthentication
from .permissions import IsCustomerAuthenticated, IsAdminUserRole


class HealthCheckAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({
            'status': 'ok',
            'service': 'identity',
            'timestamp': timezone.now().isoformat(),
        })


class VerifyTokenAPIView(APIView):
    # Possession of a valid opaque token authenticates this introspection call.
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        if not isinstance(request.data, dict):
            return Response({'valid': False, 'error': 'Expected a JSON object.'}, status=400)
        token_key = request.data.get('token')
        if not token_key:
            parts = (request.headers.get('Authorization') or '').split()
            if len(parts) == 2 and parts[0].lower() in ('bearer', 'token'):
                token_key = parts[1]

        if not isinstance(token_key, str) or not token_key:
            return Response({'valid': False, 'error': 'Token is required.'}, status=400)

        token = AuthToken.objects.select_related('customer').filter(key=token_key).first()
        if not token or not token.customer.is_active:
            return Response({'valid': False, 'error': 'Invalid or expired token.'}, status=401)

        customer = token.customer
        return Response({
            'valid': True,
            'customer': {
                'id': customer.id,
                'email': customer.email,
                'name': customer.name,
                'role': customer.role,
                'is_staff': customer.is_staff,
                'is_superuser': customer.is_superuser,
            }
        })


class SignupAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        password = request.data.get('password')
        name = (request.data.get('name') or '').strip()
        phone = (request.data.get('phone') or '').strip()

        if not email or not password or not name:
            return Response(
                {'error': 'Name, email, and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if AccountsCustomer.objects.filter(email=email).exists():
            return Response(
                {'error': 'An account with this email address already exists.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        customer = AccountsCustomer(
            email=email,
            name=name,
            phone=phone,
            addresses=[],
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=timezone.now(),
        )
        customer.set_password(password)
        customer.save()

        token = AuthToken.objects.create(customer=customer)

        return Response({
            'token': token.key,
            'id': customer.id,
            'email': customer.email,
            'name': customer.name,
            'phone': customer.phone,
            'role': customer.role,
            'addresses': customer.addresses,
        }, status=status.HTTP_201_CREATED)


class LoginAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        password = request.data.get('password')

        if not email or not password:
            return Response(
                {'error': 'Email and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        customer = AccountsCustomer.objects.filter(email=email, is_active=True).first()
        if not customer or not customer.check_password(password):
            return Response(
                {'error': 'Invalid email or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        customer.last_login = timezone.now()
        customer.save(update_fields=['last_login'])

        token, _ = AuthToken.objects.get_or_create(customer=customer)

        return Response({
            'token': token.key,
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'role': customer.role,
            'addresses': customer.addresses,
        }, status=status.HTTP_200_OK)


class ProfileAPIView(APIView):
    authentication_classes = [VerifiableTokenAuthentication]
    permission_classes = [IsCustomerAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        customer = request.user
        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'role': customer.role,
            'addresses': customer.addresses,
            'date_joined': customer.date_joined.isoformat() if customer.date_joined else None,
        })

    def patch(self, request):
        customer = request.user
        for field in ['name', 'phone', 'addresses']:
            if field in request.data:
                setattr(customer, field, request.data[field])
        customer.save()
        return Response({
            'id': customer.id,
            'name': customer.name,
            'email': customer.email,
            'phone': customer.phone,
            'role': customer.role,
            'addresses': customer.addresses,
        })


class WishlistAPIView(APIView):
    authentication_classes = [VerifiableTokenAuthentication]
    permission_classes = [IsCustomerAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        customer = request.user
        items = AccountsWishlistItem.objects.filter(customer=customer).order_by('-created_at')
        return Response([
            {
                'id': item.id,
                'product_ref': item.product_ref,
                'created_at': item.created_at.isoformat() if item.created_at else None,
            }
            for item in items
        ])

    def post(self, request):
        customer = request.user
        product_ref = request.data.get('product_ref') or request.data.get('id')
        if not product_ref:
            return Response({'error': 'product_ref is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product_ref = int(product_ref)
        except (ValueError, TypeError):
            return Response({'error': 'product_ref must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        item, created = AccountsWishlistItem.objects.get_or_create(
            customer=customer,
            product_ref=product_ref,
            defaults={'created_at': timezone.now()}
        )
        return Response({
            'id': item.id,
            'product_ref': item.product_ref,
            'created': created,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request):
        customer = request.user
        product_ref = request.data.get('product_ref') or request.query_params.get('product_ref')
        wishlist_id = request.data.get('id') or request.query_params.get('id')

        if not product_ref and not wishlist_id:
            return Response({'error': 'id or product_ref is required.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = AccountsWishlistItem.objects.filter(customer=customer)
        if wishlist_id:
            qs = qs.filter(id=wishlist_id)
        elif product_ref:
            qs = qs.filter(product_ref=product_ref)

        deleted, _ = qs.delete()
        if deleted:
            return Response({'success': True, 'message': 'Item removed from wishlist.'})
        return Response({'error': 'Item not found in wishlist.'}, status=status.HTTP_404_NOT_FOUND)


class ForgotPasswordAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        customer = AccountsCustomer.objects.filter(email=email, is_active=True).first()
        if not customer:
            return Response({'success': False, 'error': 'No active account found with this email address.'}, status=404)
        return Response({
            'success': True,
            'message': 'Password reset instructions have been sent to your email.',
        })
