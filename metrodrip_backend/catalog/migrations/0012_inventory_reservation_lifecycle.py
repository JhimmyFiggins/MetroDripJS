from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('catalog', '0011_inventorystockmovement'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventoryreservation',
            name='committed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='inventoryreservation',
            name='released_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='inventoryreservation',
            name='status',
            field=models.CharField(db_index=True, default='active', max_length=16),
        ),
        migrations.AddField(
            model_name='inventoryreservation',
            name='warehouse_id',
            field=models.BigIntegerField(default=1),
        ),
        migrations.AddIndex(
            model_name='inventoryreservation',
            index=models.Index(fields=['order_id', 'status'], name='inventory_r_order_i_b21025_idx'),
        ),
        migrations.AddConstraint(
            model_name='inventoryreservation',
            constraint=models.UniqueConstraint(fields=('order_id', 'product', 'variant'), name='uniq_reservation_order_product_variant'),
        ),
    ]
