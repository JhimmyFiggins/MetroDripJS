from django.urls import path
from .views import (
    WishlistAPIView,
    ProfileAPIView,
    LoginAPIView,
    CheckCustomerAPIView,
    SignupAPIView,
    ForgotPasswordAPIView,
    UserMeAPIView,
    UserPasswordAPIView,
    UserMfaAPIView,
    UserSessionsAPIView,
)

urlpatterns = [
    path('signup/', SignupAPIView.as_view(), name='customer-signup'),
    path('login/', LoginAPIView.as_view(), name='customer-login'),
    path('forgot-password/', ForgotPasswordAPIView.as_view(), name='customer-forgot-password'),
    path('password-reset/', ForgotPasswordAPIView.as_view(), name='customer-password-reset'),
    path('check-customer/', CheckCustomerAPIView.as_view(), name='check-customer'),
    path('profile/', ProfileAPIView.as_view(), name='customer-profile'),
    path('wishlist/', WishlistAPIView.as_view(), name='customer-wishlist'),
    path('users/me/', UserMeAPIView.as_view(), name='user-me'),
    path('api/users/me/', UserMeAPIView.as_view(), name='api-user-me'),
    path('users/me/password/', UserPasswordAPIView.as_view(), name='user-password'),
    path('users/me/mfa/', UserMfaAPIView.as_view(), name='user-mfa'),
    path('users/me/sessions/revoke/', UserSessionsAPIView.as_view(), name='user-sessions-revoke'),
]