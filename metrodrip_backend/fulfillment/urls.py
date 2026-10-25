from django.urls import path
from .views import (
    DeviceTokenAPIView,
    NotificationListAPIView,
    NotificationReadAPIView,
    NotificationReadAllAPIView,
)

urlpatterns = [
    path('notifications/', NotificationListAPIView.as_view(), name='notification-list'),
    path('notifications/devices/', DeviceTokenAPIView.as_view(), name='notification-device'),
    path('notifications/read-all/', NotificationReadAllAPIView.as_view(), name='notification-read-all'),
    path('notifications/<int:notification_id>/read/', NotificationReadAPIView.as_view(), name='notification-read'),
]
