from django.db import models


class CmsHomepageBanner(models.Model):
    PLACEMENT_CHOICES = [
        ('homepage_hero', 'Homepage hero'),
        ('homepage_secondary', 'Homepage secondary'),
        ('announcement_bar', 'Announcement bar'),
        ('category_banner', 'Category banner'),
        ('checkout_footer', 'Checkout footer'),
    ]

    id = models.BigAutoField(primary_key=True)
    title = models.CharField(max_length=200)
    headline = models.CharField(max_length=200, blank=True, default='')
    subtext = models.CharField(max_length=255, blank=True, default='')
    button_label = models.CharField(max_length=50, blank=True, default='Shop Now')
    placement = models.CharField(
        max_length=32,
        choices=PLACEMENT_CHOICES,
        default='homepage_hero',
        db_index=True,
    )
    image_url = models.CharField(max_length=254)
    link_url = models.CharField(max_length=200)
    is_active = models.BooleanField()
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    order = models.SmallIntegerField()

    class Meta:
        db_table = 'cms_homepagebanner'


class CmsContactMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=150)
    email = models.CharField(max_length=254)
    message = models.TextField()
    created_at = models.DateTimeField()
    is_resolved = models.BooleanField()

    class Meta:
        db_table = 'cms_contactmessage'
