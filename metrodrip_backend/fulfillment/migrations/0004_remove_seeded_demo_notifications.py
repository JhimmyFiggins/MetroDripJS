from django.db import migrations


# These exact records were inserted by migration 0002 for the original UI demo.
# Matching every stable field avoids deleting legitimate customer notifications.
DEMO_NOTIFICATIONS = (
    (
        'order',
        'Out for delivery',
        'Your order MD-2026-00318 is with the rider.',
    ),
    (
        'drop',
        'Drop 01 is live',
        'New hoodies and tees just landed. Shop before they sell out.',
    ),
    (
        'payment',
        'Payment confirmed',
        '₱2,632 received via GCash for MD-2026-00318.',
    ),
    (
        'review',
        'Review your order',
        'Tell us how the Skyline Pullover fits.',
    ),
    (
        'stock',
        'Back in stock',
        'Metro Snapback (Black) is available again.',
    ),
)


def remove_seeded_demo_notifications(apps, schema_editor):
    notification_model = apps.get_model('fulfillment', 'NotificationsNotification')

    for category, title, body in DEMO_NOTIFICATIONS:
        notification_model.objects.filter(
            customer_ref=1,
            category=category,
            title=title,
            body=body,
            order_ref__isnull=True,
        ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('fulfillment', '0003_seed_shipping_zones'),
    ]

    operations = [
        migrations.RunPython(
            remove_seeded_demo_notifications,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
