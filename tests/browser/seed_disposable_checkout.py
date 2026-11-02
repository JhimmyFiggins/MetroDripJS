"""Seed one purchasable product in a disposable local Django database."""

import os
import sys
import tempfile
from decimal import Decimal
from pathlib import Path


# Refuse to mutate the normal project database or a remote provider database.
if os.environ.get('QA_DISPOSABLE_DB') != '1':
    raise SystemExit('QA_DISPOSABLE_DB=1 is required.')
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'metrodrip_backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'metrodrip_backend.settings')

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.utils import timezone  # noqa: E402
from catalog.models import (  # noqa: E402
    CatalogCategory, CatalogColor, CatalogProduct, CatalogProductVariant, InventoryStockEntry,
)
from fulfillment.models import ShippingShippingZone  # noqa: E402
from identity.models import PlatformSetting  # noqa: E402


# The resolved SQLite filename must live below the operating system's Temp root.
database = settings.DATABASES['default']
if database['ENGINE'] != 'django.db.backends.sqlite3':
    raise SystemExit('Only disposable SQLite is supported.')
database_path = Path(database['NAME']).resolve()
if not database_path.is_relative_to(Path(tempfile.gettempdir()).resolve()):
    raise SystemExit('Database must live under the system Temp directory.')

now = timezone.now()
category, _ = CatalogCategory.objects.get_or_create(
    slug='disposable-browser-qa',
    defaults={'name': 'Disposable Browser QA', 'description': 'Local checkout fixture',
              'is_active': True, 'created_at': now, 'updated_at': now},
)
product, _ = CatalogProduct.objects.get_or_create(
    sku='DISPOSABLE-BROWSER-001',
    defaults={'name': 'Disposable Browser Hoodie', 'description': 'Local checkout fixture',
              'category': category, 'base_price': Decimal('100.00'), 'currency': 'PHP',
              'is_active': True, 'is_featured': True, 'created_at': now, 'updated_at': now},
)
color, _ = CatalogColor.objects.get_or_create(
    name='Disposable Browser Black',
    defaults={'hex_code': '#101011', 'created_at': now, 'updated_at': now},
)
variant, _ = CatalogProductVariant.objects.get_or_create(
    sku='DISPOSABLE-BROWSER-001-BLK-L',
    defaults={'product': product, 'color': color, 'attributes': {'size': 'L'},
              'price_adjustment': Decimal('0.00'), 'is_active': True,
              'created_at': now, 'updated_at': now},
)
InventoryStockEntry.objects.get_or_create(
    product=product, variant=variant, warehouse_id=77,
    defaults={'quantity': 10, 'reserved_quantity': 0, 'last_counted_at': now,
              'created_at': now, 'updated_at': now},
)
ShippingShippingZone.objects.update_or_create(
    name='NCR (Metro Manila)', defaults={'fee': Decimal('85.00'), 'is_active': True},
)
PlatformSetting.objects.update_or_create(
    id=1, defaults={'enabled_payment_methods': ['cod']},
)
print(f'Disposable product ID: {product.id}; variant ID: {variant.id}')
