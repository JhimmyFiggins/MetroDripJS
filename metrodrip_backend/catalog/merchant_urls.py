from django.urls import path
from .merchant_views import (
    MerchantDashboardAPIView,
    MerchantProductsAPIView,
    MerchantProductDetailAPIView,
    MerchantCategoriesAPIView,
    MerchantRestockAPIView,
    MerchantStockMovementsAPIView,
    MerchantReviewsAPIView,
    MerchantReviewDetailAPIView,
    MerchantReviewReplyAPIView,
    MerchantReviewModerateAPIView,
    MerchantOrdersAPIView,
    MerchantOrdersExportAPIView,
    MerchantAnalyticsAPIView,
)

urlpatterns = [
    path('dashboard/', MerchantDashboardAPIView.as_view(), name='merchant-dashboard'),
    path('products/', MerchantProductsAPIView.as_view(), name='merchant-products'),
    path('products/<int:pk>/', MerchantProductDetailAPIView.as_view(), name='merchant-product-detail'),
    path('categories/', MerchantCategoriesAPIView.as_view(), name='merchant-categories'),
    path('inventory/restock/', MerchantRestockAPIView.as_view(), name='merchant-restock'),
    path('inventory/movements/', MerchantStockMovementsAPIView.as_view(), name='merchant-stock-movements'),
    path('reviews/', MerchantReviewsAPIView.as_view(), name='merchant-reviews'),
    path('reviews/<int:pk>/', MerchantReviewDetailAPIView.as_view(), name='merchant-review-detail'),
    path('reviews/<int:pk>/reply/', MerchantReviewReplyAPIView.as_view(), name='merchant-review-reply'),
    path('reviews/<int:pk>/moderate/', MerchantReviewModerateAPIView.as_view(), name='merchant-review-moderate'),
    path('orders/', MerchantOrdersAPIView.as_view(), name='merchant-orders'),
    path('orders/export/', MerchantOrdersExportAPIView.as_view(), name='merchant-orders-export'),
    path('orders/<int:pk>/', MerchantOrdersAPIView.as_view(), name='merchant-order-detail'),
    path('orders/<int:pk>/status/', MerchantOrdersAPIView.as_view(), name='merchant-order-status'),
    path('analytics/', MerchantAnalyticsAPIView.as_view(), name='merchant-analytics'),
]

