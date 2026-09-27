from django.urls import path, include

urlpatterns = [
    path('api/admin/', include('identity.admin_urls')),
    path('', include('identity.urls')),
]
