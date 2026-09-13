from django.contrib import admin

from .models import (
    CatalogCategory,
    CatalogProduct,
)


admin.site.register(CatalogCategory)
admin.site.register(CatalogProduct)