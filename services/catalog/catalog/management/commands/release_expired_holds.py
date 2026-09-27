from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from catalog.models import InventoryReservation, InventoryStockEntry, InventoryStockMovement

class Command(BaseCommand):
    help = 'Release expired stock reservations back to available inventory'

    def handle(self, *args, **options):
        now = timezone.now()
        with transaction.atomic():
            expired = InventoryReservation.objects.select_for_update().filter(
                status='active',
                expires_at__lt=now
            )
            count = expired.count()
            for res in expired:
                stock = InventoryStockEntry.objects.select_for_update().filter(variant=res.variant).first()
                if stock:
                    stock.reserved_quantity = max(0, stock.reserved_quantity - res.quantity)
                    stock.updated_at = now
                    stock.save(update_fields=['reserved_quantity', 'updated_at'])

                res.status = 'expired'
                res.ended_at = now
                res.save(update_fields=['status', 'ended_at'])

                InventoryStockMovement.objects.create(
                    variant=res.variant,
                    sku=res.variant.sku,
                    delta=res.quantity,
                    reason='release',
                )

        self.stdout.write(self.style.SUCCESS(f"Released {count} expired stock reservations."))
