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

    def get(self, request):
        orders = OrdersOrder.objects.filter(
            customer_id=request.user.id
        ).order_by('-created_at')
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    def post(self, request):
        print("REQUEST DATA:", request.data)

        serializer = OrderSerializer(data=request.data)

        if serializer.is_valid():
            order = serializer.save(customer_id=request.user.id)
            return Response(
                OrderSerializer(order).data,
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )