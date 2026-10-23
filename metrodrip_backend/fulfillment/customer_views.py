from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ShippingShippingZone


class CustomerShippingZonesAPIView(APIView):
    """Public read of active delivery zones. Fees stay server-owned at checkout."""

    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        zones = ShippingShippingZone.objects.filter(is_active=True).order_by('id')
        return Response({
            'currency': 'PHP',
            'zones': [
                {
                    'id': zone.id,
                    'name': zone.name,
                    'fee': f'{int(zone.fee)}.00',
                }
                for zone in zones
            ],
        })
