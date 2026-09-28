import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from identity.models import AccountsCustomer


class Command(BaseCommand):
    help = 'Interactively provisions an administrator or merchant with a hashed password.'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)
        parser.add_argument('--name', required=True)
        parser.add_argument('--role', required=True, choices=('admin', 'merchant'))

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        name = options['name'].strip()
        role = options['role']
        if not email or '@' not in email or not name:
            raise CommandError('A valid email and non-empty name are required.')
        if AccountsCustomer.objects.filter(email__iexact=email).exists():
            raise CommandError('An account with this email already exists.')

        password = getpass.getpass('Password: ')
        confirmation = getpass.getpass('Confirm password: ')
        if password != confirmation:
            raise CommandError('Passwords do not match.')
        try:
            validate_password(password)
        except ValidationError as error:
            raise CommandError(' '.join(error.messages)) from error

        user = AccountsCustomer(
            email=email,
            name=name,
            phone='',
            addresses={},
            is_active=True,
            is_staff=True,
            is_superuser=role == 'admin',
            role=role,
            date_joined=timezone.now(),
        )
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f'Provisioned {role} account {email}.'))
