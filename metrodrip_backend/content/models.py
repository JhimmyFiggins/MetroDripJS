from django.db import models


class CmsHomepageBanner(models.Model):
    id = models.BigAutoField(primary_key=True)
    title = models.CharField(max_length=200)
    image_url = models.CharField(max_length=254)
    link_url = models.CharField(max_length=200)
    is_active = models.BooleanField()
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