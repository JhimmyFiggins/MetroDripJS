from django.urls import path
from .merchant_views import (
    MerchantDashboardAPIView,
    MerchantProductsAPIView,
    MerchantRestockAPIView,
    MerchantStockMovementsAPIView,
    MerchantReviewsAPIView,
    MerchantReviewDetailAPIView,
    MerchantReviewReplyAPIView,
    MerchantReviewModerateAPIView,
    MerchantAnalyticsAPIView,
)

urlpatterns = [
    path('dashboard/', MerchantDashboardAPIView.as_view(), name='merchant-dashboard'),
    path('products/', MerchantProductsAPIView.as_view(), name='merchant-products'),
    path('inventory/restock/', MerchantRestockAPIView.as_view(), name='merchant-restock'),
    path('inventory/movements/', MerchantStockMovementsAPIView.as_view(), name='merchant-stock-movements'),
    path('reviews/', MerchantReviewsAPIView.as_view(), name='merchant-reviews'),
    path('reviews/<int:pk>/', MerchantReviewDetailAPIView.as_view(), name='merchant-review-detail'),
    path('reviews/<int:pk>/reply/', MerchantReviewReplyAPIView.as_view(), name='merchant-review-reply'),
    path('reviews/<int:pk>/moderate/', MerchantReviewModerateAPIView.as_view(), name='merchant-review-moderate'),
    path('analytics/', MerchantAnalyticsAPIView.as_view(), name='merchant-analytics'),
]
