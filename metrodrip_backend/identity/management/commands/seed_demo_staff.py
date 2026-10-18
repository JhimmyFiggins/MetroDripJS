from django.core.management.base import BaseCommand
from django.utils import timezone
from identity.models import AccountsCustomer


class Command(BaseCommand):
    help = 'Seeds administrator and merchant accounts if they do not already exist.'

    def handle(self, *args, **options):
        accounts = [
            {
                'email': 'admin@metrodrip.ph',
                'name': 'MetroDrip Admin',
                'role': 'admin',
                'is_superuser': True,
                'password': 'Admin1234!',
            },
            {
                'email': 'merchant@metrodrip.ph',
                'name': 'MetroDrip Merchant',
                'role': 'merchant',
                'is_superuser': False,
                'password': 'Merchant1234!',
            },
        ]

        for acc in accounts:
            user = AccountsCustomer.objects.filter(email__iexact=acc['email']).first()
            if not user:
                user = AccountsCustomer(
                    email=acc['email'],
                    name=acc['name'],
                    phone='',
                    addresses={},
                    is_active=True,
                    is_staff=True,
                    is_superuser=acc['is_superuser'],
                    role=acc['role'],
                    date_joined=timezone.now(),
                )
                user.set_password(acc['password'])
                user.save()
                self.stdout.write(self.style.SUCCESS(f"Created {acc['role']} account: {acc['email']}"))
            else:
                user.set_password(acc['password'])
                user.is_staff = True
                user.role = acc['role']
                user.save()
                self.stdout.write(self.style.SUCCESS(f"Updated {acc['role']} account: {acc['email']}"))
