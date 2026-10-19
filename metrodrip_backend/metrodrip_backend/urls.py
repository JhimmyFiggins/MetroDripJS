from django.urls import include, path, re_path

from metrodrip_backend.console_views import console_file
from orders.views import (
    CheckoutAPIView,
    HealthAPIView,
    PaymentCapabilitiesAPIView,
    PaymentReturnAPIView,
    PayMongoWebhookAPIView,
)

urlpatterns = [
    path('health/', HealthAPIView.as_view(), name='health'),
    path('api/admin/', include('identity.admin_urls')),
    path('api/merchant/', include('catalog.merchant_urls')),
    path('api/payments/capabilities/', PaymentCapabilitiesAPIView.as_view(), name='payment-capabilities'),
    path('api/orders/checkout/', CheckoutAPIView.as_view(), name='secure-checkout'),
    path('api/payments/paymongo/webhook/', PayMongoWebhookAPIView.as_view(), name='paymongo-webhook'),
    path('payment/return', PaymentReturnAPIView.as_view(), name='payment-return'),
    path('', include('catalog.urls')),
    path('orders/', include('orders.urls')),
    path('', include('fulfillment.urls')),
    path('', include('identity.urls')),
    path('', console_file, name='console-home'),
    path('favicon.ico', console_file, {'asset_path': 'favicon.ico'}, name='console-favicon'),
    re_path(
        r'^(?P<asset_path>(?:Registration|admin|assets|css|js|merchant)(?:/.*)?)$',
        console_file,
        name='console-file',
    ),
]
