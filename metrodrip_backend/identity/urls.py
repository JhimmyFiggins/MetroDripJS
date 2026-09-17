from django.urls import path
from .views import WishlistAPIView
from .views import ProfileAPIView, LoginAPIView, CheckCustomerAPIView, SignupAPIView

urlpatterns = [
    path('signup/', SignupAPIView.as_view()),
    path('login/', LoginAPIView.as_view()),
    path('check-customer/', CheckCustomerAPIView.as_view()),
    path('profile/', ProfileAPIView.as_view()),
    path('wishlist/', WishlistAPIView.as_view()),
    
    
]