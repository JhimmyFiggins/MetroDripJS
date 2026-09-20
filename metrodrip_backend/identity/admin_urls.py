from django.urls import path
from .admin_views import (
    AdminDashboardAPIView,
    AdminUsersAPIView,
    AdminUserDetailAPIView,
    AdminAuditLogsAPIView,
    AdminExportUsersCSVAPIView,
    AdminShippingZonesAPIView,
    AdminRolesAPIView,
)

urlpatterns = [
    path('dashboard/', AdminDashboardAPIView.as_view(), name='admin-dashboard'),
    path('users/', AdminUsersAPIView.as_view(), name='admin-users'),
    path('users/<int:pk>/', AdminUserDetailAPIView.as_view(), name='admin-user-detail'),
    path('audit-logs/', AdminAuditLogsAPIView.as_view(), name='admin-audit-logs'),
    path('export-users/', AdminExportUsersCSVAPIView.as_view(), name='admin-export-users'),
    path('shipping-zones/', AdminShippingZonesAPIView.as_view(), name='admin-shipping-zones'),
    path('shipping-zones/<int:pk>/', AdminShippingZonesAPIView.as_view(), name='admin-shipping-zones-detail'),
    path('roles/', AdminRolesAPIView.as_view(), name='admin-roles'),
]

