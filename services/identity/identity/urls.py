from django.urls import path
from .views import (
    HealthCheckAPIView,
    VerifyTokenAPIView,
    SignupAPIView,
    LoginAPIView,
    ProfileAPIView,
    WishlistAPIView,
    ForgotPasswordAPIView,
)

urlpatterns = [
    path('health/', HealthCheckAPIView.as_view(), name='identity-health'),
    path('api/identity/verify-token/', VerifyTokenAPIView.as_view(), name='identity-verify-token'),
    path('signup/', SignupAPIView.as_view(), name='customer-signup'),
    path('login/', LoginAPIView.as_view(), name='customer-login'),
    path('profile/', ProfileAPIView.as_view(), name='customer-profile'),
    path('wishlist/', WishlistAPIView.as_view(), name='customer-wishlist'),
    path('forgot-password/', ForgotPasswordAPIView.as_view(), name='customer-forgot-password'),
]
