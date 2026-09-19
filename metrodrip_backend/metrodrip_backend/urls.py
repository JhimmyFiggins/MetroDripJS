from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('catalog.urls')),
    path('orders/', include('orders.urls')),
    path('', include('identity.urls')),
]