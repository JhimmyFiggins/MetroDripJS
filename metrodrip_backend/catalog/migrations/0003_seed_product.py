from django.db import migrations
from django.utils import timezone


def seed_product(apps, schema_editor):
    CatalogProduct = apps.get_model("catalog", "CatalogProduct")

    CatalogProduct.objects.get_or_create(
        sku="MD-TSHIRT-001",
        defaults={
            "name": "Men's Round T-shirt",
            "description": "Classic men's round-neck t-shirt.",
            "image_url": None,
            "category": None,
            "base_price": 499.00,
            "currency": "PHP",
            "is_active": True,
            "is_featured": True,
            "created_at": timezone.now(),
            "updated_at": timezone.now(),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0002_catalogproduct_image_url"),
    ]

    operations = [
        migrations.RunPython(seed_product),
    ]