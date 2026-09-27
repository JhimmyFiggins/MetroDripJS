from django.urls import path, include

urlpatterns = [
    path('api/merchant/', include('orders.merchant_urls')),
    path('', include('orders.urls')),
]
