from django.urls import path
from .views import (
    ShippingZonesAPIView,
    ShipmentsAPIView,
)

urlpatterns = [
    path('shipping-zones/', ShippingZonesAPIView.as_view(), name='merchant-shipping-zones'),
    path('shipping-zones/<int:pk>/', ShippingZonesAPIView.as_view(), name='merchant-shipping-zone-detail'),
    path('shipments/', ShipmentsAPIView.as_view(), name='merchant-shipments'),
]
