from django.db import models


class CatalogCategory(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='parent_id',
        related_name='children'
    )

    class Meta:
        db_table = 'catalog_category'


class CatalogProduct(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    description = models.TextField()

    category = models.ForeignKey(
        CatalogCategory,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        db_column='category_id',
        related_name='products'
    )

    base_price = models.PositiveIntegerField(default=0)
    images = models.JSONField()
    is_active = models.BooleanField()
    is_mock = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'catalog_product'