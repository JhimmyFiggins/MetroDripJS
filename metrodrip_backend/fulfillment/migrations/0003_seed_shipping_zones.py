from django.db import migrations


DEFAULT_ZONES = (
    ('NCR (Metro Manila)', 85),
    ('North & South Luzon', 120),
    ('Visayas & Mindanao (VisMin)', 150),
)


def seed_shipping_zones(apps, schema_editor):
    zone_model = apps.get_model('fulfillment', 'ShippingShippingZone')
    for name, fee in DEFAULT_ZONES:
        zone_model.objects.get_or_create(
            name=name,
            defaults={'fee': fee, 'is_active': True},
        )


class Migration(migrations.Migration):
    dependencies = [
        ('fulfillment', '0002_seed_demo_notifications'),
    ]

    operations = [
        migrations.RunPython(seed_shipping_zones, migrations.RunPython.noop),
    ]
