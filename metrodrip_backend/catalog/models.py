from django.db import models

class CatalogProduct(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    description = models.TextField()
    category_id = models.BigIntegerField()
    base_price = models.PositiveIntegerField()
    images = models.JSONField()
    is_active = models.BooleanField()
    is_mock = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'catalog_product'
