from django.db import migrations
from django.utils import timezone


def seed_product_variants(apps, schema_editor):
    CatalogProduct = apps.get_model("catalog", "CatalogProduct")
    CatalogProductVariant = apps.get_model("catalog", "CatalogProductVariant")

    product = CatalogProduct.objects.filter(sku="MD-TSHIRT-001").first()
    if not product:
        return

    variants = [
        {
            "sku": "MD-TSHIRT-001-S-BLK-REG",
            "attributes": {
                "size": "S",
                "color": "Black",
                "fit": "Regular",
            },
            "price_adjustment": 0,
        },
        {
            "sku": "MD-TSHIRT-001-M-BLK-REG",
            "attributes": {
                "size": "M",
                "color": "Black",
                "fit": "Regular",
            },
            "price_adjustment": 0,
        },
        {
            "sku": "MD-TSHIRT-001-S-BLK-SLM",
            "attributes": {
                "size": "S",
                "color": "Black",
                "fit": "Slim",
            },
            "price_adjustment": 50,
        },
        {
            "sku": "MD-TSHIRT-001-M-BLK-SLM",
            "attributes": {
                "size": "M",
                "color": "Black",
                "fit": "Slim",
            },
            "price_adjustment": 50,
        },
    ]

    for variant in variants:
        CatalogProductVariant.objects.get_or_create(
            sku=variant["sku"],
            defaults={
                "product": product,
                "attributes": variant["attributes"],
                "price_adjustment": variant["price_adjustment"],
                "is_active": True,
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0005_assign_product_category"),
    ]

    operations = [
        migrations.RunPython(seed_product_variants),
    ]