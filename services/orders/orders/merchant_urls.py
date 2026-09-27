from django.urls import path
from .views import (
    MerchantOrdersAPIView,
    MerchantOrdersExportAPIView,
    MerchantAnalyticsAPIView,
)

urlpatterns = [
    path('orders/', MerchantOrdersAPIView.as_view(), name='merchant-orders'),
    path('orders/export/', MerchantOrdersExportAPIView.as_view(), name='merchant-orders-export'),
    path('orders/<str:pk>/', MerchantOrdersAPIView.as_view(), name='merchant-order-detail'),
    path('orders/<str:pk>/status/', MerchantOrdersAPIView.as_view(), name='merchant-order-status'),
    path('analytics/', MerchantAnalyticsAPIView.as_view(), name='merchant-analytics'),
]
