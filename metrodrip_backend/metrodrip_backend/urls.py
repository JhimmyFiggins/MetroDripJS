from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve

from fulfillment.customer_views import CustomerShippingZonesAPIView
from metrodrip_backend.console_views import console_file
from metrodrip_backend.media_views import media_file_view
from orders.views import (
    CheckoutAPIView,
    HealthAPIView,
    PaymentCapabilitiesAPIView,
    PaymentReturnAPIView,
    PayMongoWebhookAPIView,
)


def assetlinks_view(request):
    return JsonResponse(
        [
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": "com.metrodrip.js",
                    "sha256_cert_fingerprints": [
                        "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"
                    ],
                },
            }
        ],
        safe=False,
    )


urlpatterns = [
    path('.well-known/assetlinks.json', assetlinks_view, name='assetlinks'),
    path('health/', HealthAPIView.as_view(), name='health'),
    path('api/admin/', include('identity.admin_urls')),
    path('api/merchant/', include('catalog.merchant_urls')),
    path('api/payments/capabilities/', PaymentCapabilitiesAPIView.as_view(), name='payment-capabilities'),
    path('api/shipping-zones/', CustomerShippingZonesAPIView.as_view(), name='customer-shipping-zones'),
    path('api/orders/checkout/', CheckoutAPIView.as_view(), name='secure-checkout'),
    path('api/payments/paymongo/webhook/', PayMongoWebhookAPIView.as_view(), name='paymongo-webhook'),
    path('payment/return', PaymentReturnAPIView.as_view(), name='payment-return'),
    path('', include('catalog.urls')),
    path('orders/', include('orders.urls')),
    path('', include('fulfillment.urls')),
    path('', include('identity.urls')),
    path('', console_file, name='console-home'),
    path('favicon.ico', console_file, {'asset_path': 'favicon.ico'}, name='console-favicon'),
    path('favicon.svg', console_file, {'asset_path': 'assets/favicon.svg'}, name='console-favicon-svg'),
    path('favicon.png', console_file, {'asset_path': 'assets/favicon.png'}, name='console-favicon-png'),
    re_path(
        r'^(?P<asset_path>(?:Registration|admin|assets|css|js|merchant|customer)(?:/.*)?)$',
        console_file,
        name='console-file',
    ),
    re_path(
        r'^media/(?P<path>.*)$',
        media_file_view,
        name='media-file',
    ),
]
