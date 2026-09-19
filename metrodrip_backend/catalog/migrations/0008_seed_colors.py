from django.db import migrations
from django.utils import timezone


def seed_colors(apps, schema_editor):
    CatalogColor = apps.get_model("catalog", "CatalogColor")

    CatalogColor.objects.get_or_create(
        name="Black",
        defaults={
            "hex_code": "#000000",
            "is_active": True,
            "created_at": timezone.now(),
            "updated_at": timezone.now(),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0007_catalogcolor_catalogproductvariant_color"),
    ]

    operations = [
        migrations.RunPython(seed_colors),
    ]