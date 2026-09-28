from django.urls import path
from .views import (
    CancelCheckoutAPIView,
    CreateOrderAPIView,
    OrderDetailAPIView,
    OrderTrackingAPIView,
)

urlpatterns = [
    path('', CreateOrderAPIView.as_view(), name='order-create-or-list'),
    path('<int:order_id>/', OrderDetailAPIView.as_view(), name='order-detail'),
    path('<int:order_id>/cancel/', CancelCheckoutAPIView.as_view(), name='order-cancel'),
    path('<int:order_id>/tracking/', OrderTrackingAPIView.as_view(), name='order-tracking'),
]
