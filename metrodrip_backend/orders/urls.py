from django.urls import path
from .views import CreateOrderAPIView

urlpatterns = [
    path('', CreateOrderAPIView.as_view()),
]