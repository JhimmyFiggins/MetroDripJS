from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from identity.models import AccountsCustomer, AuditLog
from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
    InventoryStockMovement,
)
from orders.models import OrdersOrder, OrdersOrderLine, OrdersShippingAddress, OrdersPayment, ReviewsReview


class Command(BaseCommand):
    help = 'Seeds initial console data strictly matching Figma frames 15:2, 57:2, and 58:2'

    def handle(self, *args, **options):
        self.stdout.write('Seeding console data from Figma specifications...')
        now = timezone.now()

        # 1. Accounts & Users (Admin Console - Figma 15:2)
        users_to_seed = [
            {'email': 'juan@email.com', 'name': 'Juan Dela Cruz', 'role': 'customer', 'is_active': True, 'phone': '+63 917 111 2233'},
            {'email': 'bea@email.com', 'name': 'Bea Santos', 'role': 'customer', 'is_active': True, 'phone': '+63 918 222 3344'},
            {'email': 'merch@metrodrip.ph', 'name': 'Store Merchant', 'role': 'merchant', 'is_active': True, 'phone': '+63 919 333 4455'},
            {'email': 'spam@x.com', 'name': 'Flagged User', 'role': 'customer', 'is_active': False, 'phone': '+63 920 444 5566'},
            {'email': 'admin@metrodrip.ph', 'name': 'Admin User', 'role': 'admin', 'is_active': True, 'phone': '+63 921 555 6677'},
            {'email': 'miguel@email.com', 'name': 'Miguel Reyes', 'role': 'customer', 'is_active': True, 'phone': '+63 922 666 7788'},
            {'email': 'aliyah@email.com', 'name': 'Aliyah Cruz', 'role': 'customer', 'is_active': True, 'phone': '+63 923 777 8899'},
            {'email': 'marco@email.com', 'name': 'Marco Lim', 'role': 'customer', 'is_active': True, 'phone': '+63 924 888 9900'},
        ]

        for u_data in users_to_seed:
            AccountsCustomer.objects.update_or_create(
                email=u_data['email'],
                defaults={
                    'name': u_data['name'],
                    'role': u_data['role'],
                    'is_active': u_data['is_active'],
                    'phone': u_data['phone'],
                    'is_staff': u_data['role'] in ['admin', 'merchant'],
                    'is_superuser': u_data['role'] == 'admin',
                    'password': 'pbkdf2_sha256$mock_password',
                    'addresses': [],
                    'date_joined': now - timedelta(days=5),
                }
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(users_to_seed)} accounts.'))

        # 2. Audit Trail (Figma 15:2)
        AuditLog.objects.all().delete()
        audit_events = [
            {'actor': 'Admin User', 'action': 'Suspended customer #1042', 'hours_ago': 0.3},
            {'actor': 'Admin User', 'action': 'Updated NCR shipping fee → ₱85', 'hours_ago': 0.8},
            {'actor': 'Store Merchant', 'action': 'Approved review #318', 'hours_ago': 1.1},
            {'actor': 'Admin User', 'action': 'Granted merchant role → R. Carlos', 'hours_ago': 1.5},
            {'actor': 'System', 'action': 'Nightly backup verified', 'hours_ago': 2.0},
        ]
        for a in audit_events:
            AuditLog.objects.create(
                actor=a['actor'],
                actor_role='admin' if 'Admin' in a['actor'] else ('merchant' if 'Merchant' in a['actor'] else 'system'),
                action=a['action'],
                target_model='System',
                created_at=now - timedelta(hours=a['hours_ago']),
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(audit_events)} audit trail logs.'))

        # 3. Categories (Figma 58:2)
        cat_tops, _ = CatalogCategory.objects.get_or_create(
            slug='tops-hoodies',
            defaults={'name': 'Tops › Hoodies', 'description': 'Hoodies & Sweats', 'is_active': True, 'created_at': now, 'updated_at': now}
        )
        cat_tees, _ = CatalogCategory.objects.get_or_create(
            slug='tops-tshirts',
            defaults={'name': 'Tops › T-Shirts', 'description': 'Graphic & Plain Tees', 'is_active': True, 'created_at': now, 'updated_at': now}
        )
        cat_denim, _ = CatalogCategory.objects.get_or_create(
            slug='bottoms-denim',
            defaults={'name': 'Bottoms › Denim', 'description': 'Jeans & Denim', 'is_active': True, 'created_at': now, 'updated_at': now}
        )
        cat_caps, _ = CatalogCategory.objects.get_or_create(
            slug='accessories-caps',
            defaults={'name': 'Accessories › Caps', 'description': 'Headwear & Caps', 'is_active': True, 'created_at': now, 'updated_at': now}
        )
        cat_socks, _ = CatalogCategory.objects.get_or_create(
            slug='accessories-socks',
            defaults={'name': 'Accessories › Socks', 'description': 'Crew Socks', 'is_active': True, 'created_at': now, 'updated_at': now}
        )

        # 4. Products & Variants (Figma 58:2 & 57:2)
        products_data = [
            {
                'name': 'Drip Zip-Up Hoodie',
                'sku': 'MD-HD-002-BLK-M-OVS',
                'category': cat_tops,
                'price': 1249.00,
                'stock': 3,
                'is_active': True,
                'variant_attr': {'size': 'M', 'color': 'BLK', 'fit': 'oversized'},
            },
            {
                'name': 'Metro Core Boxy Tee',
                'sku': 'MD-TS-001-WHT-XL-REG',
                'category': cat_tees,
                'price': 649.00,
                'stock': 46,
                'is_active': True,
                'variant_attr': {'size': 'XL', 'color': 'WHT', 'fit': 'regular'},
            },
            {
                'name': 'Metro Straight-Cut Jeans',
                'sku': 'MD-DN-001-IND-32-STR',
                'category': cat_denim,
                'price': 1099.00,
                'stock': 31,
                'is_active': True,
                'variant_attr': {'size': '32', 'color': 'IND', 'fit': 'straight'},
            },
            {
                'name': 'Metro Snapback',
                'sku': 'MD-CP-001-BLK-OS',
                'category': cat_caps,
                'price': 499.00,
                'stock': 3,
                'is_active': True,
                'variant_attr': {'size': 'OS', 'color': 'BLK', 'fit': 'regular'},
            },
            {
                'name': 'Drip Crew Socks 3-Pack',
                'sku': 'MD-SK-001-WHT-OS',
                'category': cat_socks,
                'price': 349.00,
                'stock': 0,
                'is_active': False,
                'variant_attr': {'size': 'OS', 'color': 'WHT', 'fit': 'regular'},
            },
        ]

        for p_data in products_data:
            prod, _ = CatalogProduct.objects.update_or_create(
                sku=p_data['sku'],
                defaults={
                    'name': p_data['name'],
                    'category': p_data['category'],
                    'base_price': p_data['price'],
                    'currency': 'PHP',
                    'is_active': p_data['is_active'],
                    'is_featured': True,
                    'description': f"Premium MetroDrip apparel: {p_data['name']}",
                    'created_at': now - timedelta(days=10),
                    'updated_at': now,
                }
            )

            variant, _ = CatalogProductVariant.objects.update_or_create(
                sku=p_data['sku'],
                defaults={
                    'product': prod,
                    'attributes': p_data['variant_attr'],
                    'price_adjustment': 0,
                    'is_active': p_data['is_active'],
                    'created_at': now - timedelta(days=10),
                    'updated_at': now,
                }
            )

            InventoryStockEntry.objects.update_or_create(
                product=prod,
                variant=variant,
                warehouse_id=1,
                defaults={
                    'quantity': p_data['stock'],
                    'reserved_quantity': 0,
                    'last_counted_at': now,
                    'created_at': now - timedelta(days=10),
                    'updated_at': now,
                }
            )

        self.stdout.write(self.style.SUCCESS(f'Seeded {len(products_data)} products, variants, and stock entries.'))

        # 5. Stock Movement Ledger (Figma 58:2)
        InventoryStockMovement.objects.all().delete()
        movements_data = [
            {'sku': 'MD-HD-002-BLK-M-OVS', 'delta': 25, 'reason': 'restock', 'mins_ago': 40},
            {'sku': 'MD-TS-001-WHT-L-REG', 'delta': -2, 'reason': 'sale', 'mins_ago': 56},
            {'sku': 'MD-CP-001-BLK-OS', 'delta': -1, 'reason': 'sale', 'mins_ago': 73},
            {'sku': 'MD-DN-001-IND-32-STR', 'delta': 1, 'reason': 'return', 'mins_ago': 105},
        ]
        for m in movements_data:
            variant = CatalogProductVariant.objects.filter(sku=m['sku']).first()
            InventoryStockMovement.objects.create(
                variant=variant,
                sku=m['sku'],
                delta=m['delta'],
                reason=m['reason'],
                created_at=now - timedelta(minutes=m['mins_ago']),
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(movements_data)} stock movements.'))

        # 6. Review Moderation Queue (Figma 58:2)
        ReviewsReview.objects.all().delete()
        reviews_data = [
            {
                'customer_name': 'Bea S.',
                'product_name': 'Drip Zip-Up Hoodie',
                'rating': 5,
                'body': 'Super lapad ng fit, ang angas ng tela!',
                'status': 'pending',
            },
            {
                'customer_name': 'Marco L.',
                'product_name': 'Metro Snapback',
                'rating': 3,
                'body': 'Color is slightly off from photo.',
                'status': 'pending',
            },
        ]
        for r in reviews_data:
            ReviewsReview.objects.create(
                customer_name=r['customer_name'],
                product_name=r['product_name'],
                rating=r['rating'],
                body=r['body'],
                status=r['status'],
                created_at=now - timedelta(hours=2),
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(reviews_data)} reviews in moderation queue.'))

        # 7. Recent Orders (Figma 57:2)
        orders_data = [
            {'id': 318, 'total': 2632, 'status': 'paid'},
            {'id': 317, 'total': 1249, 'status': 'packed'},
            {'id': 316, 'total': 3447, 'status': 'shipped'},
            {'id': 315, 'total': 849, 'status': 'pending'},
            {'id': 314, 'total': 1798, 'status': 'paid'},
        ]
        for o in orders_data:
            order, _ = OrdersOrder.objects.update_or_create(
                id=o['id'],
                defaults={
                    'status': o['status'],
                    'subtotal': o['total'] - 85,
                    'shipping': 85,
                    'tax': 0,
                    'discount': 0,
                    'total': o['total'],
                    'currency': 'PHP',
                    'created_at': now - timedelta(hours=1),
                    'updated_at': now,
                }
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(orders_data)} orders.'))
        self.stdout.write(self.style.SUCCESS('Successfully seeded all console data.'))
