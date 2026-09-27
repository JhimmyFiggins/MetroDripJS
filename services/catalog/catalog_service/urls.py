from django.urls import path, include

urlpatterns = [
    path('api/merchant/', include('catalog.merchant_urls')),
    path('', include('catalog.urls')),
]
