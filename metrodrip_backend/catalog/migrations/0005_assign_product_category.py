from django.db import migrations


def assign_product_category(apps, schema_editor):
    CatalogProduct = apps.get_model("catalog", "CatalogProduct")
    CatalogCategory = apps.get_model("catalog", "CatalogCategory")

    category = CatalogCategory.objects.get(
        slug="t-shirts",
        parent=None
    )

    CatalogProduct.objects.filter(
        sku="MD-TSHIRT-001"
    ).update(category=category)


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0004_seed_categories"),
    ]

    operations = [
        migrations.RunPython(assign_product_category),
    ]