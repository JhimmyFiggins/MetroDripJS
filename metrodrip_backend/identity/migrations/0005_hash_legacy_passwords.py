from django.contrib.auth.hashers import identify_hasher, make_password
from django.db import migrations


def hash_legacy_passwords(apps, schema_editor):
    customer_model = apps.get_model('identity', 'AccountsCustomer')
    for customer in customer_model.objects.only('id', 'password').iterator(chunk_size=200):
        try:
            identify_hasher(customer.password)
        except ValueError:
            customer_model.objects.filter(pk=customer.pk).update(
                password=make_password(customer.password)
            )


class Migration(migrations.Migration):
    dependencies = [
        ('identity', '0004_customer_access_token'),
    ]

    operations = [
        migrations.RunPython(hash_legacy_passwords, migrations.RunPython.noop),
    ]
