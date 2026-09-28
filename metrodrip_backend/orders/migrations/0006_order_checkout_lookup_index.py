from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('orders', '0005_checkout_payments'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='ordersorder',
            index=models.Index(
                fields=['customer_id', 'checkout_fingerprint', 'status'],
                name='order_customer_checkout_idx',
            ),
        ),
    ]
