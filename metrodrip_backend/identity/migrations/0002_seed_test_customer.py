from django.db import migrations
from django.utils import timezone


def create_test_customer(apps, schema_editor):
    AccountsCustomer = apps.get_model('identity', 'AccountsCustomer')

    AccountsCustomer.objects.get_or_create(
        email='test@metrodrip.com',
        defaults={
            'password': 'test123',
            'name': 'Mike Eleanor',
            'phone': '0000000000',
            'addresses': {},
            'is_active': True,
            'is_staff': False,
            'is_superuser': False,
            'role': 'customer',
            'date_joined': timezone.now(),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_test_customer),
    ]