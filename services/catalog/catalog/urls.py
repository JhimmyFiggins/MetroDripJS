from django.urls import path
from .views import (
    HealthCheckAPIView,
    ProductsAPIView,
    CategoriesAPIView,
    VariantsAPIView,
    CatalogQuoteAPIView,
    CatalogReserveStockAPIView,
    CatalogCommitReservationAPIView,
    CatalogReleaseReservationAPIView,
    MerchantInventoryAPIView,
)

urlpatterns = [
    path('health/', HealthCheckAPIView.as_view(), name='catalog-health'),
    
    # Public browsing
    path('products/', ProductsAPIView.as_view(), name='catalog-products'),
    path('products/<int:pk>/', ProductsAPIView.as_view(), name='catalog-product-detail'),
    path('categories/', CategoriesAPIView.as_view(), name='catalog-categories'),
    path('variants/', VariantsAPIView.as_view(), name='catalog-variants'),
    path('variants/<int:pk>/', VariantsAPIView.as_view(), name='catalog-variant-detail'),
    
    # SAGA Contracts
    path('api/catalog/quote/', CatalogQuoteAPIView.as_view(), name='catalog-quote'),
    path('api/catalog/reserve/', CatalogReserveStockAPIView.as_view(), name='catalog-reserve-stock'),
    path('api/catalog/reserve/<str:checkout_id>/commit/', CatalogCommitReservationAPIView.as_view(), name='catalog-commit-reservation'),
    path('api/catalog/reserve/<str:checkout_id>/release/', CatalogReleaseReservationAPIView.as_view(), name='catalog-release-reservation'),

    # Inventory
    path('inventory/', MerchantInventoryAPIView.as_view(), name='catalog-inventory'),
]
