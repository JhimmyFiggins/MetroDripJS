from django.db import migrations


def assign_product_category(apps, schema_editor):
    CatalogProduct = apps.get_model("catalog", "CatalogProduct")
    CatalogCategory = apps.get_model("catalog", "CatalogCategory")

    try:
        category = CatalogCategory.objects.get(slug="t-shirts", parent=None)
        CatalogProduct.objects.filter(sku="MD-TSHIRT-001").update(
            category=category
        )
    except CatalogCategory.DoesNotExist:
        pass


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0002_catalogproduct_image_url"),
    ]

    operations = [
        migrations.RunPython(assign_product_category),
    ]