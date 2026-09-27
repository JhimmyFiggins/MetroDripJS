from django.urls import path
from .admin_views import (
    AdminDashboardAPIView,
    AdminUsersAPIView,
    AdminUserDetailAPIView,
    AdminAuditLogsAPIView,
    AdminExportUsersCSVAPIView,
    AdminRolesAPIView,
    AdminSettingsAPIView,
    AdminUserResetPasswordAPIView,
    AdminExportAuditLogsCSVAPIView,
)

urlpatterns = [
    path('dashboard/', AdminDashboardAPIView.as_view(), name='admin-dashboard'),
    path('users/', AdminUsersAPIView.as_view(), name='admin-users'),
    path('users/<int:pk>/', AdminUserDetailAPIView.as_view(), name='admin-user-detail'),
    path('users/<int:pk>/reset-password/', AdminUserResetPasswordAPIView.as_view(), name='admin-user-reset-password'),
    path('users/export/', AdminExportUsersCSVAPIView.as_view(), name='admin-export-users'),
    path('audit/', AdminAuditLogsAPIView.as_view(), name='admin-audit-logs'),
    path('audit/export/', AdminExportAuditLogsCSVAPIView.as_view(), name='admin-export-audit'),
    path('roles/', AdminRolesAPIView.as_view(), name='admin-roles'),
    path('settings/', AdminSettingsAPIView.as_view(), name='admin-settings'),
]
