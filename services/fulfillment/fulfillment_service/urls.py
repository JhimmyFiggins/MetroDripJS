from django.urls import path, include

urlpatterns = [
    path('api/merchant/', include('fulfillment.merchant_urls')),
    path('', include('fulfillment.urls')),
]
