from django.urls import path
from .views import (
    HealthCheckAPIView,
    PublicBannersAPIView,
    MerchantBannersAPIView,
    MerchantBannerDetailAPIView,
    ContactMessagesAPIView,
    ContactMessageDetailAPIView,
)

urlpatterns = [
    path('health/', HealthCheckAPIView.as_view(), name='content-health'),
    # Public endpoints
    path('banners/', PublicBannersAPIView.as_view(), name='public-banners'),
    path('api/content/banners/', PublicBannersAPIView.as_view(), name='content-banners'),
    path('contact/', ContactMessagesAPIView.as_view(), name='public-contact'),
    path('api/content/contact/', ContactMessagesAPIView.as_view(), name='content-contact'),
    # Merchant endpoints
    path('api/merchant/banners/', MerchantBannersAPIView.as_view(), name='merchant-banners'),
    path('api/merchant/banners/<int:pk>/', MerchantBannerDetailAPIView.as_view(), name='merchant-banner-detail'),
    path('api/merchant/contact-messages/', ContactMessagesAPIView.as_view(), name='merchant-contact-messages'),
    path('api/merchant/contact-messages/<int:pk>/', ContactMessageDetailAPIView.as_view(), name='merchant-contact-detail'),
]
