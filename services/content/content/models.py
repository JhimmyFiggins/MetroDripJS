from django.db import models

class CmsHomepageBanner(models.Model):
    id = models.BigAutoField(primary_key=True)
    title = models.CharField(max_length=200)
    image_url = models.CharField(max_length=254, default='/assets/banners/default.jpg')
    link_url = models.CharField(max_length=200, default='/shop')
    is_active = models.BooleanField(default=True)
    order = models.SmallIntegerField(default=1)

    class Meta:
        db_table = 'cms_homepagebanner'
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.title} (Order: {self.order})"


class CmsContactMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=150)
    email = models.CharField(max_length=254)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_resolved = models.BooleanField(default=False)

    class Meta:
        db_table = 'cms_contactmessage'
        ordering = ['-created_at']

    def __str__(self):
        return f"Message from {self.name} <{self.email}>"
