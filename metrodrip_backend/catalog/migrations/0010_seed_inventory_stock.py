from django.db import migrations
from django.utils import timezone


def seed_inventory_stock(apps, schema_editor):
    InventoryStockEntry = apps.get_model('catalog', 'InventoryStockEntry')
    CatalogProductVariant = apps.get_model('catalog', 'CatalogProductVariant')

    variants = CatalogProductVariant.objects.filter(
        product_id=1,
        is_active=True
    )

    for variant in variants:
        InventoryStockEntry.objects.get_or_create(
            product_id=1,
            variant_id=variant.id,
            warehouse_id=1,
            defaults={
                'quantity': 50,
                'reserved_quantity': 0,
                'last_counted_at': timezone.now(),
                'created_at': timezone.now(),
                'updated_at': timezone.now(),
            }
        )


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0009_assign_variant_colors'),
    
    ]

    operations = [
        migrations.RunPython(seed_inventory_stock),
    ]