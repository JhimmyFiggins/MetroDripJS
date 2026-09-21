from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import AccountsCustomer


class CustomerAuthentication(BaseAuthentication):

    def authenticate(self, request):
        customer_id = (
            request.headers.get('X-Customer-ID')
            or request.headers.get('x-customer-id')
            or request.META.get('HTTP_X_CUSTOMER_ID')
        )

        if not customer_id:
            auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
            if auth_header:
                parts = auth_header.split()
                if len(parts) == 2 and parts[0].lower() in ['bearer', 'token', 'customer']:
                    customer_id = parts[1]

        if not customer_id:
            # Query param fallback
            if hasattr(request, 'query_params'):
                customer_id = request.query_params.get('customer_id')
            elif hasattr(request, 'GET'):
                customer_id = request.GET.get('customer_id')

        if not customer_id:
            return None

        try:
            customer = AccountsCustomer.objects.filter(
                id=int(customer_id),
                is_active=True
            ).first()
            if not customer:
                raise AuthenticationFailed('Invalid customer.')
        except (ValueError, TypeError):
            raise AuthenticationFailed('Invalid customer ID format.')

        return (customer, None) 