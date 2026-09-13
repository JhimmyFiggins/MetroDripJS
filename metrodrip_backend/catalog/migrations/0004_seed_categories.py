from django.db import migrations
from django.utils import timezone


def seed_categories(apps, schema_editor):
    CatalogCategory = apps.get_model("catalog", "CatalogCategory")

    categories = [
        {
            "name": "T-Shirts",
            "slug": "t-shirts",
            "description": "T-shirts and casual tops.",
        },
        {
            "name": "Pants",
            "slug": "pants",
            "description": "Pants and trousers.",
        },
        {
            "name": "Jackets",
            "slug": "jackets",
            "description": "Jackets and outerwear.",
        },
        {
            "name": "Accessories",
            "slug": "accessories",
            "description": "Fashion accessories.",
        },
    ]

    for category in categories:
        CatalogCategory.objects.get_or_create(
            slug=category["slug"],
            parent=None,
            defaults={
                "name": category["name"],
                "description": category["description"],
                "is_active": True,
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_seed_product"),
    ]

    operations = [
        migrations.RunPython(seed_categories),
    ]