from django.core.management.base import BaseCommand
from django.utils import timezone
from content.models import CmsHomepageBanner, CmsContactMessage

class Command(BaseCommand):
    help = 'Seed Content service with initial homepage banners and contact messages'

    def handle(self, *args, **options):
        self.stdout.write("Seeding Content database...")

        # Default banners
        default_banners = [
            {
                'title': 'Urban Style Redefined',
                'image_url': '/assets/banners/hero.jpg',
                'link_url': '/shop',
                'is_active': True,
                'order': 1,
            },
            {
                'title': 'Free shipping over ₱2,500',
                'image_url': '/assets/banners/shipping.jpg',
                'link_url': '/shipping',
                'is_active': True,
                'order': 2,
            },
            {
                'title': 'Weekend drop',
                'image_url': '/assets/banners/weekend.jpg',
                'link_url': '/drops/weekend',
                'is_active': False,
                'order': 3,
            },
            {
                'title': 'New season collection',
                'image_url': '/assets/banners/fw26.jpg',
                'link_url': '/collections/fw26',
                'is_active': False,
                'order': 4,
            },
            {
                'title': 'Member early access',
                'image_url': '/assets/banners/vip.jpg',
                'link_url': '/vip',
                'is_active': False,
                'order': 5,
            },
        ]

        b_created = 0
        for b in default_banners:
            _, created = CmsHomepageBanner.objects.get_or_create(
                title=b['title'],
                defaults=b,
            )
            if created:
                b_created += 1

        self.stdout.write(f"Created {b_created} banners (total {CmsHomepageBanner.objects.count()}).")

        # Sample contact message
        msg, m_created = CmsContactMessage.objects.get_or_create(
            email='support.inquiry@example.com',
            defaults={
                'name': 'Juan Dela Cruz',
                'message': 'Hello, do you offer wholesale orders for Metro Manila boutiques?',
                'created_at': timezone.now(),
                'is_resolved': False,
            }
        )
        if m_created:
            self.stdout.write("Created initial sample contact message.")

        self.stdout.write(self.style.SUCCESS("Content service seeding completed successfully."))
