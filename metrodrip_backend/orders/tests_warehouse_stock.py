from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from catalog.models import (
    CatalogCategory,
    CatalogColor,
    CatalogProduct,
    CatalogProductVariant,
    InventoryReservation,
    InventoryStockEntry,
)
from fulfillment.models import ShippingShippingZone
from identity.models import AccountsCustomer
from orders.checkout import execute_checkout
from orders.models import OrdersOrder


class WarehouseStockSelectionTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.customer = AccountsCustomer(
            email='warehouse-stock@example.invalid',
            name='Warehouse customer',
            phone='09170000000',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=now,
        )
        self.customer.set_password('synthetic-test-password')
        self.customer.save()
        category = CatalogCategory.objects.create(
            name='Warehouse category',
            slug='warehouse-stock-category',
            description='Synthetic category',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.product = CatalogProduct.objects.create(
            sku='WAREHOUSE-001',
            name='Warehouse tee',
            description='Synthetic product',
            category=category,
            base_price=Decimal('100.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=now,
            updated_at=now,
        )
        color = CatalogColor.objects.create(
            name='Warehouse Ink',
            hex_code='#0C0D0E',
            created_at=now,
            updated_at=now,
        )
        self.variant = CatalogProductVariant.objects.create(
            product=self.product,
            color=color,
            sku='WAREHOUSE-001-INK',
            attributes={'size': 'M'},
            price_adjustment=Decimal('0.00'),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.now = now
        ShippingShippingZone.objects.update_or_create(
            name='NCR (Metro Manila)',
            defaults={'fee': 85, 'is_active': True},
        )

    def add_stock(self, warehouse_id, quantity, reserved=0):
        return InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=warehouse_id,
            quantity=quantity,
            reserved_quantity=reserved,
            last_counted_at=self.now,
            created_at=self.now,
            updated_at=self.now,
        )

    def payload(self, quantity, key):
        return {
            'items': [{'variant_id': self.variant.id, 'quantity': quantity}],
            'delivery_zone': 'NCR (Metro Manila)',
            'payment_method': 'cod',
            'idempotency_key': key,
            'shipping_address': {
                'name': 'Warehouse customer',
                'address_line1': '1 Sample Street',
                'city': 'Manila',
                'state': 'NCR',
                'postal_code': '1000',
                'country': 'PH',
                'phone': '09170000000',
            },
        }

    def test_checkout_uses_first_warehouse_that_can_fulfill_the_quantity(self):
        empty = self.add_stock(1, 0)
        available = self.add_stock(2, 5)

        order, _payment, _replay = execute_checkout(self.customer, self.payload(1, 'warehouse-select-001'))

        empty.refresh_from_db()
        available.refresh_from_db()
        reservation = InventoryReservation.objects.get(order_id=order.id, variant=self.variant)
        self.assertEqual(empty.quantity, 0)
        self.assertEqual(empty.reserved_quantity, 0)
        self.assertEqual(available.quantity, 4)
        self.assertEqual(available.reserved_quantity, 0)
        self.assertEqual(reservation.warehouse_id, 2)
        self.assertEqual(reservation.status, 'committed')
        self.assertEqual(OrdersOrder.objects.count(), 1)

    def test_checkout_rejects_quantity_no_single_warehouse_can_fulfill(self):
        self.add_stock(1, 2)
        self.add_stock(2, 3)

        with self.assertRaises(Exception) as caught:
            execute_checkout(self.customer, self.payload(4, 'warehouse-select-002'))

        self.assertEqual(caught.exception.code, 'insufficient_stock')
        self.assertFalse(OrdersOrder.objects.filter(checkout_idempotency_key='warehouse-select-002').exists())
        self.assertFalse(InventoryReservation.objects.exists())
