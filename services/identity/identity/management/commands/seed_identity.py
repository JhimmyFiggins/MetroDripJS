import json
import sqlite3
from pathlib import Path
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from identity.models import AccountsCustomer, AccountsWishlistItem, AuthToken

class Command(BaseCommand):
    help = 'Safely migrate or seed customers into db_identity with hashed passwords'

    def handle(self, *args, **options):
        baseline_db = Path(__file__).resolve().parent.parent.parent.parent.parent.parent / 'metrodrip_backend' / 'db.sqlite3'
        
        migrated_count = 0
        if baseline_db.exists():
            conn = sqlite3.connect(baseline_db)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT * FROM accounts_customer")
                rows = cursor.fetchall()
                for row in rows:
                    raw_dict = dict(row)
                    cust_id = raw_dict['id']
                    email = raw_dict['email']
                    existing = AccountsCustomer.objects.filter(id=cust_id).first() or AccountsCustomer.objects.filter(email=email).first()
                    if not existing:
                        addr_raw = raw_dict.get('addresses')
                        addresses = []
                        if isinstance(addr_raw, str):
                            try:
                                addresses = json.loads(addr_raw)
                            except Exception:
                                addresses = []
                        elif isinstance(addr_raw, list):
                            addresses = addr_raw

                        dj_val = raw_dict.get('date_joined')
                        date_joined = parse_datetime(dj_val) if isinstance(dj_val, str) else timezone.now()
                        if date_joined and timezone.is_naive(date_joined):
                            date_joined = timezone.make_aware(date_joined)

                        customer = AccountsCustomer(
                            id=cust_id,
                            email=email,
                            name=raw_dict.get('name', 'Customer'),
                            phone=raw_dict.get('phone', ''),
                            addresses=addresses,
                            is_active=bool(raw_dict.get('is_active', 1)),
                            is_staff=bool(raw_dict.get('is_staff', 0)),
                            is_superuser=bool(raw_dict.get('is_superuser', 0)),
                            role=raw_dict.get('role', 'customer'),
                            date_joined=date_joined or timezone.now(),
                        )
                        raw_pwd = raw_dict.get('password', '')
                        if raw_pwd.startswith('pbkdf2_') or raw_pwd.startswith('argon2'):
                            customer.password = raw_pwd
                        else:
                            customer.set_password(raw_pwd or 'SecurePass123!')
                        customer.save()
                        AuthToken.objects.get_or_create(customer=customer)
                        migrated_count += 1
            except Exception as e:
                self.stderr.write(f"Error reading baseline DB: {e}")
            finally:
                conn.close()

        # Ensure essential seed accounts exist
        seed_users = [
            {
                'email': 'admin@metrodrip.ph',
                'name': 'System Administrator',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
                'password': 'AdminSecurePassword2026!',
            },
            {
                'email': 'merch@metrodrip.ph',
                'name': 'Store Merchant',
                'role': 'merchant',
                'is_staff': True,
                'is_superuser': False,
                'password': 'MerchantSecurePassword2026!',
            },
            {
                'email': 'customer@metrodrip.ph',
                'name': 'Juan Dela Cruz',
                'role': 'customer',
                'is_staff': False,
                'is_superuser': False,
                'password': 'CustomerSecurePassword2026!',
            },
        ]
        for u in seed_users:
            if not AccountsCustomer.objects.filter(email=u['email']).exists():
                c = AccountsCustomer(
                    email=u['email'],
                    name=u['name'],
                    role=u['role'],
                    is_staff=u['is_staff'],
                    is_superuser=u['is_superuser'],
                    addresses=[{'city': 'Taguig', 'line1': '123 BGC Serendra', 'state': 'Metro Manila', 'phone': '+63 917 123 4567'}],
                    is_active=True,
                    date_joined=timezone.now(),
                )
                c.set_password(u['password'])
                c.save()
                AuthToken.objects.create(customer=c)
                migrated_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded/migrated accounts. Total customers in db_identity: {AccountsCustomer.objects.count()}"))
