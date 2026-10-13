from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from identity.models import RequestRateLimitBucket


class Command(BaseCommand):
    help = 'Deletes inactive database-backed rate-limit identities in bounded batches.'

    def add_arguments(self, parser):
        parser.add_argument('--older-than-hours', type=int, default=168)
        parser.add_argument('--batch-size', type=int, default=1000)

    def handle(self, *args, **options):
        older_than_hours = options['older_than_hours']
        batch_size = options['batch_size']
        if older_than_hours < 1:
            raise CommandError('--older-than-hours must be at least 1.')
        if batch_size < 1 or batch_size > 10000:
            raise CommandError('--batch-size must be between 1 and 10000.')

        cutoff = timezone.now() - timedelta(hours=older_than_hours)
        ids = list(
            RequestRateLimitBucket.objects.filter(updated_at__lt=cutoff)
            .order_by('updated_at')
            .values_list('id', flat=True)[:batch_size]
        )
        deleted, _details = RequestRateLimitBucket.objects.filter(id__in=ids).delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} inactive rate-limit bucket(s).'))
