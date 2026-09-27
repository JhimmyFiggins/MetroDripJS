from django.urls import path
from .views import (
    HealthCheckAPIView,
    OrdersListCreateAPIView,
    OrderDetailAPIView,
    OrderTrackingAPIView,
    ReviewsAPIView,
)

urlpatterns = [
    path('health/', HealthCheckAPIView.as_view(), name='orders-health'),
    path('orders/', OrdersListCreateAPIView.as_view(), name='orders-list-create'),
    path('api/orders/checkout/', OrdersListCreateAPIView.as_view(), name='orders-checkout-alias'),
    path('api/orders/', OrdersListCreateAPIView.as_view(), name='orders-api-alias'),
    path('orders/<int:pk>/', OrderDetailAPIView.as_view(), name='orders-detail'),
    path('orders/<int:pk>/tracking/', OrderTrackingAPIView.as_view(), name='orders-tracking'),
    path('reviews/', ReviewsAPIView.as_view(), name='reviews-list-create'),
]
