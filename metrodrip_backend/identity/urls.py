from django.urls import path
from .views import (
    WishlistAPIView,
    ProfileAPIView,
    LoginAPIView,
    CheckCustomerAPIView,
    SignupAPIView,
    ForgotPasswordAPIView,
)

urlpatterns = [
    path('signup/', SignupAPIView.as_view(), name='customer-signup'),
    path('login/', LoginAPIView.as_view(), name='customer-login'),
    path('forgot-password/', ForgotPasswordAPIView.as_view(), name='customer-forgot-password'),
    path('password-reset/', ForgotPasswordAPIView.as_view(), name='customer-password-reset'),
    path('check-customer/', CheckCustomerAPIView.as_view(), name='check-customer'),
    path('profile/', ProfileAPIView.as_view(), name='customer-profile'),
    path('wishlist/', WishlistAPIView.as_view(), name='customer-wishlist'),
]