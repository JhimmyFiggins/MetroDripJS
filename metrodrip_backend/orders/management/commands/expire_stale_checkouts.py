from django.core.management.base import BaseCommand, CommandError

from orders.checkout import expire_stale_checkouts


class Command(BaseCommand):
    help = 'Expires a bounded batch of stale online checkouts and releases their inventory holds.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=25)

    def handle(self, *args, **options):
        limit = options['limit']
        if limit < 1 or limit > 500:
            raise CommandError('--limit must be between 1 and 500.')
        expired = expire_stale_checkouts(limit=limit)
        self.stdout.write(self.style.SUCCESS(f'Expired {expired} stale checkout(s).'))
