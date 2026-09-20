from django.urls import path
from .admin_views import (
    AdminDashboardAPIView,
    AdminUsersAPIView,
    AdminUserDetailAPIView,
    AdminUserResetPasswordAPIView,
    AdminAuditLogsAPIView,
    AdminExportAuditLogsCSVAPIView,
    AdminExportUsersCSVAPIView,
    AdminShippingZonesAPIView,
    AdminRolesAPIView,
    AdminSettingsAPIView,
)

urlpatterns = [
    path('dashboard/', AdminDashboardAPIView.as_view(), name='admin-dashboard'),
    path('users/', AdminUsersAPIView.as_view(), name='admin-users'),
    path('users/<int:pk>/', AdminUserDetailAPIView.as_view(), name='admin-user-detail'),
    path('users/<int:pk>/reset-password/', AdminUserResetPasswordAPIView.as_view(), name='admin-user-reset-password'),
    path('settings/', AdminSettingsAPIView.as_view(), name='admin-settings'),
    path('audit-logs/', AdminAuditLogsAPIView.as_view(), name='admin-audit-logs'),
    path('audit-logs/export/', AdminExportAuditLogsCSVAPIView.as_view(), name='admin-export-audit-logs'),
    path('export-users/', AdminExportUsersCSVAPIView.as_view(), name='admin-export-users'),
    path('shipping-zones/', AdminShippingZonesAPIView.as_view(), name='admin-shipping-zones'),
    path('shipping-zones/<int:pk>/', AdminShippingZonesAPIView.as_view(), name='admin-shipping-zones-detail'),
    path('roles/', AdminRolesAPIView.as_view(), name='admin-roles'),
]


