from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import CmsHomepageBanner, CmsContactMessage


class HealthCheckAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({
            'status': 'ok',
            'service': 'content',
            'timestamp': timezone.now().isoformat(),
        })


class PublicBannersAPIView(APIView):
    """Public customer endpoint listing active banners in display order."""
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        banners = CmsHomepageBanner.objects.filter(is_active=True).order_by('order', 'id')
        data = [
            {
                'id': b.id,
                'title': b.title,
                'image_url': b.image_url,
                'link_url': b.link_url,
                'order': b.order,
            }
            for b in banners
        ]
        return Response(data)


class MerchantBannersAPIView(APIView):
    """Merchant console banner management."""
    def get(self, request):
        banners = CmsHomepageBanner.objects.all().order_by('order', 'id')
        if not banners.exists():
            default_banners = [
                {'title': 'Urban Style Redefined', 'image_url': '/assets/banners/hero.jpg', 'link_url': '/shop', 'is_active': True, 'order': 1},
                {'title': 'Free shipping over ₱2,500', 'image_url': '/assets/banners/shipping.jpg', 'link_url': '/shipping', 'is_active': True, 'order': 2},
                {'title': 'Weekend drop', 'image_url': '/assets/banners/weekend.jpg', 'link_url': '/drops/weekend', 'is_active': False, 'order': 3},
                {'title': 'New season collection', 'image_url': '/assets/banners/fw26.jpg', 'link_url': '/collections/fw26', 'is_active': False, 'order': 4},
                {'title': 'Member early access', 'image_url': '/assets/banners/vip.jpg', 'link_url': '/vip', 'is_active': False, 'order': 5},
            ]
            for b in default_banners:
                CmsHomepageBanner.objects.create(**b)
            banners = CmsHomepageBanner.objects.all().order_by('order', 'id')

        data = [
            {
                'id': b.id,
                'title': b.title,
                'image_url': b.image_url,
                'placement': 'Homepage hero' if b.order == 1 else ('Announcement bar' if b.order == 2 else 'Homepage secondary'),
                'link_url': b.link_url,
                'is_active': b.is_active,
                'status': 'Live' if b.is_active else 'Draft',
                'schedule': 'Always on' if b.is_active else 'Not scheduled',
                'order': b.order,
            }
            for b in banners
        ]
        return Response(data)

    def post(self, request):
        title = request.data.get('title', '').strip()
        link_url = request.data.get('link_url', '/shop').strip()
        is_active = bool(request.data.get('is_active', False))
        order = int(request.data.get('order', 1))

        if not title:
            return Response({'error': 'Banner title is required.'}, status=status.HTTP_400_BAD_REQUEST)

        banner = CmsHomepageBanner.objects.create(
            title=title,
            image_url='/assets/banners/default.jpg',
            link_url=link_url,
            is_active=is_active,
            order=order,
        )

        return Response({
            'id': banner.id,
            'title': banner.title,
            'image_url': banner.image_url,
            'link_url': banner.link_url,
            'is_active': banner.is_active,
            'status': 'Live' if banner.is_active else 'Draft',
            'order': banner.order,
        }, status=status.HTTP_201_CREATED)


class MerchantBannerDetailAPIView(APIView):
    def patch(self, request, pk):
        try:
            banner = CmsHomepageBanner.objects.get(pk=pk)
        except CmsHomepageBanner.DoesNotExist:
            return Response({'error': 'Banner not found.'}, status=status.HTTP_404_NOT_FOUND)

        title = request.data.get('title')
        link_url = request.data.get('link_url')
        is_active = request.data.get('is_active')
        order = request.data.get('order')

        if title is not None:
            banner.title = title.strip()
        if link_url is not None:
            banner.link_url = link_url.strip()
        if is_active is not None:
            banner.is_active = bool(is_active)
        if order is not None:
            banner.order = int(order)

        banner.save()

        return Response({
            'id': banner.id,
            'title': banner.title,
            'image_url': banner.image_url,
            'link_url': banner.link_url,
            'is_active': banner.is_active,
            'status': 'Live' if banner.is_active else 'Draft',
            'order': banner.order,
            'message': f'Banner "{banner.title}" updated successfully.',
        })

    def delete(self, request, pk):
        try:
            banner = CmsHomepageBanner.objects.get(pk=pk)
            banner.delete()
            return Response({'message': 'Banner deleted successfully.'})
        except CmsHomepageBanner.DoesNotExist:
            return Response({'error': 'Banner not found.'}, status=status.HTTP_404_NOT_FOUND)


class ContactMessagesAPIView(APIView):
    """Contact message submission (public) and listing (merchant/admin)."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        name = request.data.get('name', '').strip()
        email = request.data.get('email', '').strip()
        message = request.data.get('message', '').strip()

        if not name or not email or not message:
            return Response({'error': 'name, email, and message are required.'}, status=status.HTTP_400_BAD_REQUEST)

        msg = CmsContactMessage.objects.create(
            name=name,
            email=email,
            message=message,
            created_at=timezone.now(),
            is_resolved=False,
        )

        return Response({
            'success': True,
            'id': msg.id,
            'message': 'Thank you for reaching out. We will get back to you shortly.',
        }, status=status.HTTP_201_CREATED)

    def get(self, request):
        messages = CmsContactMessage.objects.all().order_by('-created_at')[:50]
        data = [
            {
                'id': m.id,
                'name': m.name,
                'email': m.email,
                'message': m.message,
                'is_resolved': m.is_resolved,
                'created_at': m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ]
        return Response(data)


class ContactMessageDetailAPIView(APIView):
    def patch(self, request, pk):
        try:
            msg = CmsContactMessage.objects.get(pk=pk)
        except CmsContactMessage.DoesNotExist:
            return Response({'error': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_resolved = request.data.get('is_resolved')
        if is_resolved is not None:
            msg.is_resolved = bool(is_resolved)
            msg.save(update_fields=['is_resolved'])

        return Response({
            'id': msg.id,
            'name': msg.name,
            'email': msg.email,
            'is_resolved': msg.is_resolved,
        })
