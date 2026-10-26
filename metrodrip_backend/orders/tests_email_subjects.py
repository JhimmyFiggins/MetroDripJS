from django.test import SimpleTestCase

from orders.email_subjects import distinct_product_names, order_email_subject


class Line:
    def __init__(self, snapshot='', product_name='', quantity=1):
        self.product_name_snapshot = snapshot
        self.product = type('Product', (), {'name': product_name})()
        self.quantity = quantity


class OrderEmailSubjectTests(SimpleTestCase):
    def test_single_product_and_quantity_do_not_add_more(self):
        lines = [Line('Rugged Shirt', quantity=3), Line('Rugged Shirt', quantity=2)]
        self.assertEqual(
            order_email_subject('confirmed', 9, distinct_product_names(lines)),
            'Order Confirmed: Rugged Shirt (#9) — MetroDrip',
        )

    def test_multiple_products_use_stable_order_and_extra_count(self):
        lines = [Line('Rugged Shirt'), Line('Cargo Pant'), Line('Cap')]
        self.assertEqual(
            order_email_subject('shipped', 9, distinct_product_names(lines)),
            'Order Shipped: Rugged Shirt + 2 More (#9) — MetroDrip',
        )

    def test_snapshot_wins_over_a_later_product_rename(self):
        lines = [Line('Rugged Shirt', product_name='Renamed Shirt')]
        self.assertIn('Rugged Shirt', order_email_subject('delivered', 9, distinct_product_names(lines)))
        self.assertNotIn('Renamed Shirt', order_email_subject('delivered', 9, distinct_product_names(lines)))

    def test_missing_invalid_and_long_names_are_safe(self):
        self.assertEqual(order_email_subject('cancelled', 9, distinct_product_names([Line(''), Line('null')])), 'Order Cancelled (#9) — MetroDrip')
        dirty = Line('Rugged\r\nShirt\x00')
        subject = order_email_subject('processing', 9, distinct_product_names([dirty]))
        self.assertNotIn('\n', subject)
        self.assertNotIn('\r', subject)
        self.assertIn('Rugged Shirt', subject)
        long_name = 'R' * 200
        fitted = order_email_subject('confirmed', 9, [long_name])
        self.assertLessEqual(len(fitted), 120)
        self.assertTrue(fitted.endswith('(#9) — MetroDrip'))

    def test_supported_status_labels(self):
        for status, label in (
            ('packed', 'Order Packed'),
            ('out_for_delivery', 'Order Out For Delivery'),
            ('out-for-delivery', 'Order Out For Delivery'),
            ('payment_expired', 'Order Payment Expired'),
            ('payment-expired', 'Order Payment Expired'),
            ('expired', 'Order Payment Expired'),
            ('placed', 'Order Confirmed'),
            ('paid', 'Order Confirmed'),
        ):
            self.assertTrue(order_email_subject(status, 4, ['Tee']).startswith(label))

    def test_packed_out_for_delivery_payment_expired_formats(self):
        # Packed
        self.assertEqual(
            order_email_subject('packed', 9, ['Rugged Shirt']),
            'Order Packed: Rugged Shirt (#9) — MetroDrip',
        )
        self.assertEqual(
            order_email_subject('packed', 9, ['Rugged Shirt', 'Cargo Pant']),
            'Order Packed: Rugged Shirt + 1 More (#9) — MetroDrip',
        )
        self.assertEqual(
            order_email_subject('packed', 9, []),
            'Order Packed (#9) — MetroDrip',
        )

        # Out for delivery (underscore and hyphen)
        self.assertEqual(
            order_email_subject('out_for_delivery', 9, ['Rugged Shirt']),
            'Order Out For Delivery: Rugged Shirt (#9) — MetroDrip',
        )
        self.assertEqual(
            order_email_subject('out-for-delivery', 9, ['Rugged Shirt', 'Cargo Pant']),
            'Order Out For Delivery: Rugged Shirt + 1 More (#9) — MetroDrip',
        )
        self.assertEqual(
            order_email_subject('out_for_delivery', 9, []),
            'Order Out For Delivery (#9) — MetroDrip',
        )

        # Payment expired (underscore, hyphen, alias)
        self.assertEqual(
            order_email_subject('payment_expired', 9, ['Rugged Shirt']),
            'Order Payment Expired: Rugged Shirt (#9) — MetroDrip',
        )
        self.assertEqual(
            order_email_subject('payment-expired', 9, ['Rugged Shirt', 'Cargo Pant']),
            'Order Payment Expired: Rugged Shirt + 1 More (#9) — MetroDrip',
        )
        self.assertEqual(
            order_email_subject('expired', 9, ['Rugged Shirt']),
            'Order Payment Expired: Rugged Shirt (#9) — MetroDrip',
        )
        self.assertEqual(
            order_email_subject('payment_expired', 9, []),
            'Order Payment Expired (#9) — MetroDrip',
        )

    def test_distinct_product_names_with_dicts_and_strings(self):
        items = ['Rugged Shirt', {'product_name_snapshot': 'Cargo Pant'}, Line('Cap')]
        self.assertEqual(
            distinct_product_names(items),
            ['Rugged Shirt', 'Cargo Pant', 'Cap'],
        )
