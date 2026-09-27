from django.urls import path
from .views import MerchantInventoryAPIView
from .merchant_views import (
    MerchantDashboardCatalogSliceAPIView,
    MerchantProductsAPIView,
)

urlpatterns = [
    path('dashboard/catalog/', MerchantDashboardCatalogSliceAPIView.as_view(), name='merchant-dashboard-catalog'),
    path('products/', MerchantProductsAPIView.as_view(), name='merchant-products'),
    path('products/<int:pk>/', MerchantProductsAPIView.as_view(), name='merchant-product-detail'),
    path('inventory/', MerchantInventoryAPIView.as_view(), name='merchant-inventory'),
]
