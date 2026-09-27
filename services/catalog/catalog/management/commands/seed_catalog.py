import json
import sqlite3
from pathlib import Path
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from catalog.models import (
    CatalogCategory,
    CatalogColor,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
)

class Command(BaseCommand):
    help = 'Migrate or seed catalog data from baseline into db_catalog'

    def handle(self, *args, **options):
        baseline_db = Path(__file__).resolve().parent.parent.parent.parent.parent.parent / 'metrodrip_backend' / 'db.sqlite3'
        
        if not baseline_db.exists():
            self.stdout.write("Baseline DB not found, skipping migration.")
            return

        conn = sqlite3.connect(baseline_db)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # 1. Categories
        cur.execute("SELECT * FROM catalog_category ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            created_at = parse_datetime(d.get('created_at')) or timezone.now()
            updated_at = parse_datetime(d.get('updated_at')) or timezone.now()
            if timezone.is_naive(created_at): created_at = timezone.make_aware(created_at)
            if timezone.is_naive(updated_at): updated_at = timezone.make_aware(updated_at)
            
            CatalogCategory.objects.get_or_create(
                id=d['id'],
                defaults={
                    'name': d['name'],
                    'slug': d['slug'],
                    'description': d.get('description', ''),
                    'is_active': bool(d.get('is_active', 1)),
                    'parent_id': d.get('parent_id'),
                    'created_at': created_at,
                    'updated_at': updated_at,
                }
            )

        # 2. Colors
        cur.execute("SELECT * FROM catalog_color ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            CatalogColor.objects.get_or_create(
                id=d['id'],
                defaults={
                    'name': d['name'],
                    'hex_code': d['hex_code'],
                    'is_active': bool(d.get('is_active', 1)),
                    'created_at': timezone.now(),
                    'updated_at': timezone.now(),
                }
            )

        # 3. Products
        cur.execute("SELECT * FROM catalog_product ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            created_at = parse_datetime(d.get('created_at')) or timezone.now()
            updated_at = parse_datetime(d.get('updated_at')) or timezone.now()
            if timezone.is_naive(created_at): created_at = timezone.make_aware(created_at)
            if timezone.is_naive(updated_at): updated_at = timezone.make_aware(updated_at)

            # Convert base_price to integer whole PHP pesos
            raw_price = d.get('base_price', 0)
            base_price = int(float(raw_price))

            CatalogProduct.objects.get_or_create(
                id=d['id'],
                defaults={
                    'sku': d['sku'],
                    'name': d['name'],
                    'description': d.get('description', ''),
                    'image_url': d.get('image_url'),
                    'category_id': d.get('category_id'),
                    'base_price': base_price,
                    'currency': 'PHP',
                    'is_active': bool(d.get('is_active', 1)),
                    'is_featured': bool(d.get('is_featured', 0)),
                    'created_at': created_at,
                    'updated_at': updated_at,
                }
            )

        # 4. Product Variants (check both table names for compatibility)
        try:
            cur.execute("SELECT * FROM catalog_product_variant ORDER BY id")
        except sqlite3.OperationalError:
            cur.execute("SELECT * FROM catalog_productvariant ORDER BY id")

        for row in cur.fetchall():
            d = dict(row)
            created_at = parse_datetime(d.get('created_at')) or timezone.now()
            updated_at = parse_datetime(d.get('updated_at')) or timezone.now()
            if timezone.is_naive(created_at): created_at = timezone.make_aware(created_at)
            if timezone.is_naive(updated_at): updated_at = timezone.make_aware(updated_at)

            attrs = d.get('attributes')
            if isinstance(attrs, str):
                try: attrs = json.loads(attrs)
                except Exception: attrs = {}

            price_adj = int(float(d.get('price_adjustment', 0)))

            CatalogProductVariant.objects.get_or_create(
                id=d['id'],
                defaults={
                    'product_id': d['product_id'],
                    'sku': d['sku'],
                    'color_id': d.get('color_id'),
                    'attributes': attrs,
                    'price_adjustment': price_adj,
                    'is_active': bool(d.get('is_active', 1)),
                    'created_at': created_at,
                    'updated_at': updated_at,
                }
            )

        # 5. Inventory Stock Entries
        cur.execute("SELECT * FROM inventory_stockentry ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            last_counted = parse_datetime(d.get('last_counted_at')) or timezone.now()
            if timezone.is_naive(last_counted): last_counted = timezone.make_aware(last_counted)

            InventoryStockEntry.objects.get_or_create(
                id=d['id'],
                defaults={
                    'product_id': d['product_id'],
                    'variant_id': d.get('variant_id'),
                    'warehouse_id': d.get('warehouse_id', 1),
                    'quantity': d.get('quantity', 0),
                    'reserved_quantity': d.get('reserved_quantity', 0),
                    'last_counted_at': last_counted,
                    'created_at': timezone.now(),
                    'updated_at': timezone.now(),
                }
            )

        conn.close()
        self.stdout.write(self.style.SUCCESS(
            f"Catalog seeded: {CatalogCategory.objects.count()} categories, "
            f"{CatalogProduct.objects.count()} products, "
            f"{CatalogProductVariant.objects.count()} variants, "
            f"{InventoryStockEntry.objects.count()} stock entries."
        ))
