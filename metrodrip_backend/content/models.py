from django.db import models


class CmsHomepageBanner(models.Model):
    PLACEMENT_CHOICES = [
        ('homepage_hero', 'Homepage hero'),
        ('homepage_secondary', 'Homepage secondary'),
        ('announcement_bar', 'Announcement bar'),
        ('category_banner', 'Category banner'),
        ('checkout_footer', 'Checkout footer'),
    ]

    ARTWORK_MODE_CHOICES = [
        ('graphic', 'Customizable Graphic'),
        ('image', 'Custom Image'),
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
    image_url = models.CharField(max_length=254, blank=True, default='')
    link_url = models.CharField(max_length=200)
    is_active = models.BooleanField()
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    order = models.SmallIntegerField()

    artwork_mode = models.CharField(
        max_length=20,
        choices=ARTWORK_MODE_CHOICES,
        default='graphic',
    )
    graphic_text_main = models.CharField(max_length=50, blank=True, default='MD')
    graphic_text_tagline = models.CharField(max_length=100, blank=True, default='BUILT FOR THE STREETS')
    graphic_text_sub = models.CharField(max_length=100, blank=True, default='METRODRIP / MANILA')
    graphic_bg_color = models.CharField(max_length=32, blank=True, default='#d3ee42')
    graphic_text_color = models.CharField(max_length=32, blank=True, default='#141414')
    graphic_accent_color = models.CharField(max_length=32, blank=True, default='#141414')
    graphic_alignment = models.CharField(max_length=20, blank=True, default='left')
    graphic_font_size = models.CharField(max_length=20, blank=True, default='normal')
    image_fit = models.CharField(max_length=20, blank=True, default='cover')

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
