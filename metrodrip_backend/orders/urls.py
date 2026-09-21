from django.urls import path
from .views import CreateOrderAPIView, OrderDetailAPIView

urlpatterns = [
    path('', CreateOrderAPIView.as_view(), name='order-create-or-list'),
    path('<int:order_id>/', OrderDetailAPIView.as_view(), name='order-detail'),
]