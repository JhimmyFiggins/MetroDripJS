import sqlite3
from pathlib import Path
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from fulfillment.models import (
    ShippingShippingZone,
    ShippingShipment,
    NotificationsNotification,
)

class Command(BaseCommand):
    help = 'Migrate or seed fulfillment data into db_fulfillment'

    def handle(self, *args, **options):
        # 1. Ensure Standard Shipping Zones exist
        zones = [
            {'name': 'NCR (Metro Manila)', 'fee': 85, 'is_active': True},
            {'name': 'North & South Luzon', 'fee': 120, 'is_active': True},
            {'name': 'Visayas & Mindanao (VisMin)', 'fee': 150, 'is_active': True},
        ]
        for z in zones:
            ShippingShippingZone.objects.get_or_create(
                name=z['name'],
                defaults={'fee': z['fee'], 'is_active': z['is_active']}
            )

        # 2. Seed Baseline Notifications if available
        baseline_db = Path(__file__).resolve().parent.parent.parent.parent.parent.parent / 'metrodrip_backend' / 'db.sqlite3'
        if baseline_db.exists():
            conn = sqlite3.connect(baseline_db)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            try:
                cur.execute("SELECT * FROM notifications_notification ORDER BY id")
                for row in cur.fetchall():
                    d = dict(row)
                    created_at = parse_datetime(d.get('created_at')) or timezone.now()
                    if timezone.is_naive(created_at): created_at = timezone.make_aware(created_at)

                    NotificationsNotification.objects.get_or_create(
                        id=d['id'],
                        defaults={
                            'customer_ref': d.get('customer_ref', 1),
                            'title': d.get('title', 'Notification'),
                            'body': d.get('body', ''),
                            'category': d.get('category', 'order'),
                            'order_ref': d.get('order_ref'),
                            'is_read': bool(d.get('is_read', 0)),
                            'created_at': created_at,
                        }
                    )
            except Exception as e:
                self.stderr.write(f"Notice reading notifications: {e}")
            finally:
                conn.close()

        self.stdout.write(self.style.SUCCESS(
            f"Fulfillment seeded: {ShippingShippingZone.objects.count()} shipping zones, "
            f"{NotificationsNotification.objects.count()} notifications."
        ))
