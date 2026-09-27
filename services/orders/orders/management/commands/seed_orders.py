import sqlite3
from pathlib import Path
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from orders.models import (
    OrdersOrder,
    OrdersOrderLine,
    OrdersShippingAddress,
    OrdersPayment,
    ReviewsReview,
)

class Command(BaseCommand):
    help = 'Migrate baseline orders into db_orders'

    def handle(self, *args, **options):
        baseline_db = Path(__file__).resolve().parent.parent.parent.parent.parent.parent / 'metrodrip_backend' / 'db.sqlite3'
        if not baseline_db.exists():
            self.stdout.write("Baseline DB not found.")
            return

        conn = sqlite3.connect(baseline_db)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # 1. Orders
        cur.execute("SELECT * FROM orders_order ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            created_at = parse_datetime(d.get('created_at')) or timezone.now()
            updated_at = parse_datetime(d.get('updated_at')) or timezone.now()
            if timezone.is_naive(created_at): created_at = timezone.make_aware(created_at)
            if timezone.is_naive(updated_at): updated_at = timezone.make_aware(updated_at)

            order_id = d['id']
            order_no = f"MD-2026-00{order_id:03d}"

            subtotal = int(float(d.get('subtotal', 0)))
            shipping = int(float(d.get('shipping', 0)))
            tax = int(float(d.get('tax', 0)))
            discount = int(float(d.get('discount', 0)))
            total = int(float(d.get('total', 0)))

            order, _ = OrdersOrder.objects.get_or_create(
                id=order_id,
                defaults={
                    'order_no': order_no,
                    'customer_ref': d.get('customer_id'),
                    'status': d.get('status', 'placed'),
                    'subtotal': subtotal,
                    'shipping': shipping,
                    'tax': tax,
                    'discount': discount,
                    'total': total,
                    'currency': 'PHP',
                    'notes': d.get('notes'),
                    'created_at': created_at,
                    'updated_at': updated_at,
                }
            )

        # 2. Shipping Addresses
        cur.execute("SELECT * FROM orders_shippingaddress ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            created_at = parse_datetime(d.get('created_at')) or timezone.now()
            if timezone.is_naive(created_at): created_at = timezone.make_aware(created_at)

            order_id = d.get('order_id')
            if OrdersOrder.objects.filter(id=order_id).exists():
                OrdersShippingAddress.objects.get_or_create(
                    order_id=order_id,
                    defaults={
                        'name': d.get('name', 'Valued Customer'),
                        'address_line1': d.get('address_line1', ''),
                        'address_line2': d.get('address_line2'),
                        'city': d.get('city', 'Quezon City'),
                        'state': d.get('state', 'Metro Manila'),
                        'postal_code': d.get('postal_code'),
                        'country': d.get('country', 'PH'),
                        'phone': d.get('phone', ''),
                        'created_at': created_at,
                    }
                )

        # 3. Order Lines
        cur.execute("SELECT * FROM orders_orderline ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            order_id = d.get('order_id')
            if OrdersOrder.objects.filter(id=order_id).exists():
                unit_price = int(float(d.get('unit_price', 0)))
                total_price = int(float(d.get('total_price', 0)))
                qty = d.get('quantity', 1)

                OrdersOrderLine.objects.get_or_create(
                    id=d['id'],
                    defaults={
                        'order_id': order_id,
                        'product_ref': d.get('product_id', 1),
                        'variant_ref': d.get('variant_id', 1),
                        'sku_snapshot': f"MD-SKU-{d.get('variant_id', 1)}",
                        'product_name_snapshot': 'Metro Apparel Item',
                        'quantity': qty,
                        'unit_price': unit_price,
                        'total_price': total_price,
                        'created_at': timezone.now(),
                    }
                )

        # 4. Reviews
        cur.execute("SELECT * FROM reviews_review ORDER BY id")
        for row in cur.fetchall():
            d = dict(row)
            ReviewsReview.objects.get_or_create(
                id=d['id'],
                defaults={
                    'customer_name': d.get('customer_name', 'Customer'),
                    'product_name': d.get('product_name', 'Metro Item'),
                    'customer_ref': d.get('customer_ref'),
                    'product_ref': d.get('product_ref'),
                    'order_id': d.get('order_id'),
                    'rating': d.get('rating', 5),
                    'body': d.get('body', ''),
                    'merchant_reply': d.get('merchant_reply', ''),
                    'status': d.get('status', 'approved'),
                }
            )

        conn.close()
        self.stdout.write(self.style.SUCCESS(
            f"Orders seeded: {OrdersOrder.objects.count()} orders, "
            f"{OrdersOrderLine.objects.count()} lines, "
            f"{OrdersShippingAddress.objects.count()} addresses, "
            f"{ReviewsReview.objects.count()} reviews."
        ))
