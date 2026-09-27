from django.urls import path
from .views import (
    HealthCheckAPIView,
    ShippingQuoteAPIView,
    ShippingZonesAPIView,
    ShipmentsAPIView,
    NotificationsAPIView,
    NotificationMarkReadAPIView,
    NotificationMarkAllReadAPIView,
    OrderPlacedEventConsumerAPIView,
)

urlpatterns = [
    path('health/', HealthCheckAPIView.as_view(), name='fulfillment-health'),
    path('api/fulfillment/shipping-quote/', ShippingQuoteAPIView.as_view(), name='fulfillment-shipping-quote'),
    path('api/fulfillment/events/order-placed/', OrderPlacedEventConsumerAPIView.as_view(), name='fulfillment-event-order-placed'),
    path('shipping-zones/', ShippingZonesAPIView.as_view(), name='fulfillment-shipping-zones'),
    path('shipping-zones/<int:pk>/', ShippingZonesAPIView.as_view(), name='fulfillment-shipping-zone-detail'),
    path('shipments/', ShipmentsAPIView.as_view(), name='fulfillment-shipments'),
    path('notifications/', NotificationsAPIView.as_view(), name='fulfillment-notifications'),
    path('notifications/<int:pk>/read/', NotificationMarkReadAPIView.as_view(), name='fulfillment-notification-read'),
    path('notifications/read-all/', NotificationMarkAllReadAPIView.as_view(), name='fulfillment-notification-read-all'),
]
