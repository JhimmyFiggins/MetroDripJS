from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import AccountsCustomer


class CustomerAuthentication(BaseAuthentication):

    def authenticate(self, request):
        customer_id = request.headers.get('X-Customer-ID')

        if not customer_id:
            return None

        try:
            customer = AccountsCustomer.objects.get(
                id=customer_id,
                is_active=True
            )
        except AccountsCustomer.DoesNotExist:
            raise AuthenticationFailed('Invalid customer.')

        return (customer, None) 