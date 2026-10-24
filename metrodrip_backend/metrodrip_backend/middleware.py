"""
Maintenance mode middleware for MetroDrip.
Enforces scheduled or administrator-activated maintenance mode across customer
storefront endpoints while guaranteeing uninterrupted access for:
- Administrator and Merchant consoles
- Health checks
- External payment provider webhooks
- Staff recovery sessions
"""

import logging
from django.http import JsonResponse, HttpResponse
from django.utils import timezone

logger = logging.getLogger(__name__)

EXEMPT_PREFIXES = (
    '/health',
    '/api/admin/',
    '/api/merchant/',
    '/admin',
    '/merchant',
    '/Registration',
    '/api/payments/paymongo/webhook/',
    '/payment/return',
    '/assets/',
    '/css/',
    '/js/',
    '/favicon.ico',
)


class MaintenanceModeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info

        # Always allow exempt routes
        for prefix in EXEMPT_PREFIXES:
            if path.startswith(prefix) or path == prefix:
                return self.get_response(request)

        try:
            from identity.models import PlatformSetting, CustomerAccessToken
            setting = PlatformSetting.get_instance()

            is_active = (getattr(setting, 'maintenance_mode', 'off') == 'on')
            now = timezone.now()
            if not is_active:
                start = getattr(setting, 'maintenance_scheduled_start', None)
                end = getattr(setting, 'maintenance_scheduled_end', None)
                if start and end and start <= now <= end:
                    is_active = True

            if is_active:
                # Check if staff token is supplied (allows admin and merchant recovery/testing access)
                auth_header = request.headers.get('Authorization', '') or request.META.get('HTTP_AUTHORIZATION', '')
                if auth_header.startswith('Bearer '):
                    raw_token = auth_header[7:].strip()
                    token_obj = CustomerAccessToken.objects.select_related('customer').filter(
                        token=raw_token,
                        revoked_at__isnull=True,
                        expires_at__gt=now,
                    ).first()
                    if token_obj and token_obj.customer and token_obj.customer.is_staff and token_obj.customer.role in {'admin', 'merchant'}:
                        return self.get_response(request)

                msg = getattr(setting, 'maintenance_message', '') or 'MetroDrip is undergoing scheduled maintenance. Storefront access will resume shortly.'

                # Check if JSON API requested
                accept = request.headers.get('Accept', '')
                if 'application/json' in accept or path.startswith('/api/') or request.content_type == 'application/json':
                    return JsonResponse(
                        {
                            'error': msg,
                            'code': 'maintenance_mode',
                            'maintenance': True,
                        },
                        status=503,
                    )

                # Return accessible HTML maintenance page for browsers
                html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetroDrip · Maintenance</title>
  <style>
    body {{
      margin: 0; padding: 0; background: #0A0A0A; color: #EDEDED;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
      text-align: center;
    }}
    .box {{
      max-width: 520px; padding: 40px 24px; background: #141414;
      border: 1px solid #242424; border-radius: 8px; margin: 16px;
    }}
    h1 {{
      font-size: 28px; margin: 0 0 16px; font-weight: 800; letter-spacing: -0.02em;
    }}
    h1 span {{ color: #E6FF00; }}
    p {{ font-size: 15px; line-height: 1.6; color: #A1A1AA; margin: 0 0 24px; }}
    .badge {{
      display: inline-block; padding: 4px 12px; background: rgba(230,255,0,0.1);
      border: 1px solid #E6FF00; border-radius: 4px; color: #E6FF00;
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 20px;
    }}
    .footer {{ font-size: 12px; color: #52525B; margin-top: 24px; border-top: 1px solid #242424; padding-top: 16px; }}
    .footer a {{ color: #A1A1AA; text-decoration: none; }}
    .footer a:hover {{ color: #E6FF00; }}
  </style>
</head>
<body>
  <div class="box">
    <div class="badge">Scheduled Maintenance</div>
    <h1>METRO<span>DRIP</span></h1>
    <p>{msg}</p>
    <div class="footer">
      Administrator or Merchant staff? <a href="/Registration/screens/AdminLoginScreen.html">Sign in to console &rarr;</a>
    </div>
  </div>
</body>
</html>"""
                return HttpResponse(html, status=503, content_type='text/html')

        except Exception as err:
            logger.warning("Error in MaintenanceModeMiddleware: %s", err)

        return self.get_response(request)
