from django.utils import timezone
from rest_framework import serializers

from .models import OrdersOrder, OrdersOrderLine, OrdersShippingAddress


class OrderLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdersOrderLine
        fields = [
            'id',
            'product',
            'variant',
            'quantity',
            'unit_price',
            'total_price',
            'discount_amount',
            'tax_amount',
            'tax_rate',
        ]
        read_only_fields = ['id', 'total_price']

class ShippingAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdersShippingAddress
        fields = [
            'id',
            'name',
            'address_line1',
            'address_line2',
            'city',
            'state',
            'postal_code',
            'country',
            'phone',
        ]
        read_only_fields = ['id']

class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, required=False)
    shipping_address = ShippingAddressSerializer(required=False)

    class Meta:
        model = OrdersOrder
        fields = [
            'id',
            'customer_id',
            'status',
            'subtotal',
            'tax',
            'shipping',
            'discount',
            'total',
            'currency',
            'notes',
            'created_at',
            'updated_at',
            'lines',
            'shipping_address',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        shipping_address_data = validated_data.pop('shipping_address', None)

        now = timezone.now()

        order = OrdersOrder.objects.create(
            created_at=now,
            updated_at=now,
            **validated_data
        )

        if shipping_address_data:
            OrdersShippingAddress.objects.create(
                order=order,
                created_at=now,
                updated_at=now,
                **shipping_address_data
            )
        for line_data in lines_data:
            quantity = line_data['quantity']
            unit_price = line_data['unit_price']

            OrdersOrderLine.objects.create(
                order=order,
                created_at=now,
                updated_at=now,
                total_price=unit_price * quantity,
                **line_data
            )

        return order