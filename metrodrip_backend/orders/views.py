from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import OrdersOrder
from .serializers import OrderSerializer
from identity.authentication import CustomerAuthentication

class CreateOrderAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def _resolve_customer_id(self, request):
        if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and hasattr(request.user, 'id'):
            return request.user.id

        cid = (
            request.headers.get('X-Customer-ID')
            or request.headers.get('x-customer-id')
            or request.META.get('HTTP_X_CUSTOMER_ID')
            or (request.query_params.get('customer_id') if hasattr(request, 'query_params') else None)
            or (request.GET.get('customer_id') if hasattr(request, 'GET') else None)
            or (request.data.get('customer_id') if hasattr(request, 'data') and isinstance(request.data, dict) else None)
        )
        if cid is not None:
            try:
                return int(cid)
            except (ValueError, TypeError):
                pass
        return None

    def get(self, request):
        cid = self._resolve_customer_id(request)
        if cid is not None:
            orders = OrdersOrder.objects.filter(customer_id=cid).order_by('-created_at')
        else:
            if hasattr(request, 'user') and request.user and getattr(request.user, 'is_staff', False):
                orders = OrdersOrder.objects.all().order_by('-created_at')
            else:
                orders = OrdersOrder.objects.none()

        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    def post(self, request):
        cid = self._resolve_customer_id(request)

        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if cid is not None and ('customer_id' not in data or data['customer_id'] is None):
            data['customer_id'] = cid

        serializer = OrderSerializer(data=data)

        if serializer.is_valid():
            order = serializer.save(customer_id=cid)
            return Response(
                OrderSerializer(order).data,
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class OrderDetailAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def get(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = OrderSerializer(order)
        return Response(serializer.data, status=status.HTTP_200_OK)