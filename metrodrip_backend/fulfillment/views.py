from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.permissions import IsAuthenticated

from .models import NotificationsNotification
from identity.authentication import CustomerAuthentication


CATEGORY_TO_TYPE = {
    'order': 'order',
    'order_update': 'order',
    'drop': 'drop',
    'drop_alert': 'drop',
    'payment': 'payment',
    'review': 'review',
    'stock': 'stock',
    'restock': 'stock',
}


def _resolve_customer_id(request):
    if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and hasattr(request.user, 'id'):
        return request.user.id
    return None


def _serialize_notification(notification):
    category = (notification.category or '').strip().lower()
    return {
        'id': notification.id,
        'type': CATEGORY_TO_TYPE.get(category, 'order'),
        'title': notification.title,
        'body': notification.body,
        'created_at': notification.created_at.isoformat() if notification.created_at else None,
        'is_read': bool(notification.is_read),
        'order_id': notification.order_ref,
    }


class NotificationListAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        cid = _resolve_customer_id(request)
        if cid is None:
            return Response({'unread_count': 0, 'results': []}, status=status.HTTP_200_OK)

        notifications = NotificationsNotification.objects.filter(
            customer_ref=cid
        ).order_by('-created_at')
        unread_count = notifications.filter(is_read=False).count()

        return Response({
            'unread_count': unread_count,
            'results': [_serialize_notification(n) for n in notifications],
        }, status=status.HTTP_200_OK)


class NotificationReadAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def post(self, request, notification_id):
        cid = _resolve_customer_id(request)
        notification = NotificationsNotification.objects.filter(
            id=notification_id,
            customer_ref=cid,
        ).first()
        if not notification:
            return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=['is_read'])

        return Response({'ok': True}, status=status.HTTP_200_OK)


class NotificationReadAllAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def post(self, request):
        cid = _resolve_customer_id(request)
        if cid is None:
            return Response({'ok': True}, status=status.HTTP_200_OK)

        NotificationsNotification.objects.filter(
            customer_ref=cid,
            is_read=False,
        ).update(is_read=True)

        return Response({'ok': True}, status=status.HTTP_200_OK)
