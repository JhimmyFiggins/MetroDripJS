from datetime import timedelta

from django.db import migrations
from django.utils import timezone


DEMO_NOTIFICATIONS = [
    {
        'category': 'order',
        'title': 'Out for delivery',
        'body': 'Your order MD-2026-00318 is with the rider.',
        'is_read': False,
        'age': timedelta(minutes=2),
    },
    {
        'category': 'drop',
        'title': 'Drop 01 is live',
        'body': 'New hoodies and tees just landed. Shop before they sell out.',
        'is_read': False,
        'age': timedelta(hours=1),
    },
    {
        'category': 'payment',
        'title': 'Payment confirmed',
        'body': '₱2,632 received via GCash for MD-2026-00318.',
        'is_read': True,
        'age': timedelta(hours=3),
    },
    {
        'category': 'review',
        'title': 'Review your order',
        'body': 'Tell us how the Skyline Pullover fits.',
        'is_read': True,
        'age': timedelta(days=2),
    },
    {
        'category': 'stock',
        'title': 'Back in stock',
        'body': 'Metro Snapback (Black) is available again.',
        'is_read': True,
        'age': timedelta(days=4),
    },
]


def seed_demo_notifications(apps, schema_editor):
    NotificationsNotification = apps.get_model('fulfillment', 'NotificationsNotification')
    AccountsCustomer = apps.get_model('identity', 'AccountsCustomer')

    if not AccountsCustomer.objects.filter(id=1).exists():
        return

    now = timezone.now()
    for seed in DEMO_NOTIFICATIONS:
        NotificationsNotification.objects.get_or_create(
            customer_ref=1,
            title=seed['title'],
            defaults={
                'body': seed['body'],
                'category': seed['category'],
                'order_ref': None,
                'is_read': seed['is_read'],
                'created_at': now - seed['age'],
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('fulfillment', '0001_initial'),
        ('identity', '0003_auditlog'),
    ]

    operations = [
        migrations.RunPython(seed_demo_notifications),
    ]
