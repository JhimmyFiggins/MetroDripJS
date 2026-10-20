from django.urls import path
from .views import (
    ProductListAPIView,
    ProductDetailAPIView,
    CategoryListAPIView,
    ProductVariantListAPIView,
    VariantStockAPIView,
    ProductReviewsAPIView,
    PublicBannersAPIView,
)

urlpatterns = [
    path('products/', ProductListAPIView.as_view(), name='product-list'),
    path('products/<int:pk>/', ProductDetailAPIView.as_view(), name='product-detail'),
    path('categories/', CategoryListAPIView.as_view(), name='category-list'),
    path(
        'products/<int:product_id>/variants/',
        ProductVariantListAPIView.as_view(),
        name='product-variants',
    ),
    path(
        'variants/<int:variant_id>/stock/',
        VariantStockAPIView.as_view(),
        name='variant-stock',
    ),
    path(
        'products/<int:product_id>/reviews/',
        ProductReviewsAPIView.as_view(),
        name='product-reviews',
    ),
    path('banners/', PublicBannersAPIView.as_view(), name='public-banners'),
    path('api/banners/', PublicBannersAPIView.as_view(), name='api-public-banners'),
    path('api/content/banners/', PublicBannersAPIView.as_view(), name='api-content-banners'),
]