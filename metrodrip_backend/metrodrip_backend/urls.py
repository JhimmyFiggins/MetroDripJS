from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/admin/', include('identity.admin_urls')),
    path('api/merchant/', include('catalog.merchant_urls')),
    path('', include('catalog.urls')),
    path('orders/', include('orders.urls')),
    path('', include('fulfillment.urls')),
    path('', include('identity.urls')),
]