from django.urls import path
from .views import WishlistAPIView
from .views import ProfileAPIView, LoginAPIView
urlpatterns = [
    path('wishlist/', WishlistAPIView.as_view()),
    path('profile/', ProfileAPIView.as_view()),
    path('login/', LoginAPIView.as_view()),
]