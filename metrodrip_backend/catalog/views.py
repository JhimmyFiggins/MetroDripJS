from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.renderers import JSONRenderer
from django.db import transaction
from django.db.models import Exists, OuterRef, Q

from django.utils import timezone
from .models import CatalogProduct, CatalogCategory, CatalogProductVariant, InventoryStockEntry
from content.models import CmsHomepageBanner
from orders.models import OrdersOrder, OrdersOrderLine, ReviewsReview
from identity.models import AccountsCustomer
from identity.authentication import CustomerAuthentication
from identity.throttling import DatabaseScopedRateThrottle

from .serializers import (
    ProductSerializer,
    CategorySerializer,
    ProductVariantSerializer,
    VariantStockSerializer,
)


class ProductListAPIView(ListAPIView):
    serializer_class = ProductSerializer
    renderer_classes = [JSONRenderer]

    def get_queryset(self):
        qs = CatalogProduct.objects.filter(is_active=True).prefetch_related('media')

        category_param = self.request.query_params.get('category')
        if category_param and category_param not in ['0', 'all', 'All']:
            if category_param.isdigit():
                qs = qs.filter(category_id=int(category_param))
            else:
                qs = qs.filter(category__slug=category_param)

        search_query = self.request.query_params.get('search') or self.request.query_params.get('q')
        if search_query:
            term = search_query.strip()
            qs = qs.filter(
                Q(name__icontains=term) |
                Q(description__icontains=term) |
                Q(sku__icontains=term) |
                Q(variants__sku__icontains=term)
            ).distinct()

        size_param = self.request.query_params.get('size')
        if size_param:
            qs = qs.filter(variants__attributes__size__iexact=size_param.strip())

        color_param = self.request.query_params.get('color')
        if color_param:
            color_term = color_param.strip()
            qs = qs.filter(
                Q(variants__attributes__color__iexact=color_term) |
                Q(variants__color__name__iexact=color_term)
            )

        fit_param = self.request.query_params.get('fit')
        if fit_param:
            qs = qs.filter(variants__attributes__fit__iexact=fit_param.strip())

        if size_param or color_param or fit_param:
            qs = qs.distinct()

        sort_param = (self.request.query_params.get('sort') or '').strip().lower()
        if sort_param == 'newest':
            return qs.order_by('-created_at')
        if sort_param == 'price_asc':
            return qs.order_by('base_price')
        if sort_param == 'price_desc':
            return qs.order_by('-base_price')

        return qs.order_by('id')


class ProductDetailAPIView(RetrieveAPIView):
    queryset = CatalogProduct.objects.filter(is_active=True).prefetch_related('media')
    serializer_class = ProductSerializer
    renderer_classes = [JSONRenderer]

class CategoryListAPIView(ListAPIView):
    queryset = CatalogCategory.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    renderer_classes = [JSONRenderer]

class ProductVariantListAPIView(ListAPIView):
    serializer_class = ProductVariantSerializer
    renderer_classes = [JSONRenderer]

    def get_queryset(self):
        return CatalogProductVariant.objects.filter(
            product_id=self.kwargs['product_id'],
            product__is_active=True,
            is_active=True
        ).select_related('color')

class VariantStockAPIView(ListAPIView):
    serializer_class = VariantStockSerializer
    renderer_classes = [JSONRenderer]

    def get_queryset(self):
        return InventoryStockEntry.objects.filter(
            variant_id=self.kwargs['variant_id'],
            variant__is_active=True,
            variant__product__is_active=True,
        ).select_related('variant', 'variant__product')


class ProductReviewsAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    REVIEWABLE_ORDER_STATUSES = {'delivered', 'completed'}
    MAX_REVIEW_BODY_LENGTH = 2000

    def get_throttles(self):
        if self.request.method == 'POST':
            self.throttle_scope = 'review_submission'
            return [DatabaseScopedRateThrottle()]
        return []

    def get(self, request, product_id):
        product = CatalogProduct.objects.filter(id=product_id, is_active=True).first()
        if not product:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        reviews_qs = ReviewsReview.objects.filter(
            product_ref=product_id,
            status='approved',
        ).order_by('-created_at')

        review_list = list(reviews_qs)
        total_count = len(review_list)

        # Verified badges are derived from delivered orders, never from the
        # presence of caller-supplied identifiers. Resolve all pairs in one query.
        referenced_order_ids = {
            review.order_id for review in review_list if review.order_id and review.customer_ref
        }
        verified_order_customers = set()
        if referenced_order_ids:
            verified_order_customers = set(
                OrdersOrderLine.objects.filter(
                    order_id__in=referenced_order_ids,
                    product_id=product.id,
                    order__status__in=self.REVIEWABLE_ORDER_STATUSES,
                ).values_list('order_id', 'order__customer_id')
            )

        breakdown = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
        total_rating = 0

        formatted_reviews = []
        for rev in review_list:
            r = rev.rating
            if r in breakdown:
                breakdown[r] += 1
            total_rating += r

            date_str = rev.created_at.strftime('%b %d, %Y') if rev.created_at else 'Recent'
            formatted_reviews.append({
                'id': rev.id,
                'author': rev.customer_name,
                'rating': rev.rating,
                'comment': rev.body,
                'date': date_str,
                'verified': (rev.order_id, rev.customer_ref) in verified_order_customers,
                'merchant_reply': rev.merchant_reply or '',
                'status': rev.status,
            })

        avg_rating = round(total_rating / total_count, 1) if total_count > 0 else 0.0

        return Response({
            'product_id': product.id,
            'product_name': product.name,
            'stats': {
                'average': avg_rating,
                'count': total_count,
                'breakdown': breakdown,
            },
            'reviews': formatted_reviews,
        }, status=status.HTTP_200_OK)

    def post(self, request, product_id):
        product = CatalogProduct.objects.filter(id=product_id, is_active=True).first()
        if not product:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not isinstance(request.user, AccountsCustomer) or not request.user.is_authenticated:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        customer_name = request.user.name
        customer_ref = request.user.id

        try:
            rating = int(request.data.get('rating', 5))
            if rating < 1 or rating > 5:
                return Response({'error': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({'error': 'Rating must be an integer between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        body = (request.data.get('comment') or request.data.get('body') or '').strip()
        if not body:
            return Response({'error': 'Review comment is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > self.MAX_REVIEW_BODY_LENGTH:
            return Response(
                {'error': f'Review comment must be {self.MAX_REVIEW_BODY_LENGTH} characters or fewer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requested_order_id = request.data.get('order_id')
        if requested_order_id not in (None, ''):
            try:
                requested_order_id = int(requested_order_id)
            except (ValueError, TypeError):
                return Response(
                    {'error': 'order_id must be a valid order ID.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            purchased_product = OrdersOrderLine.objects.filter(
                order_id=OuterRef('pk'),
                product_id=product.id,
            )
            eligible_orders = (
                OrdersOrder.objects.select_for_update()
                .annotate(has_purchased_product=Exists(purchased_product))
                .filter(
                    customer_id=customer_ref,
                    status__in=self.REVIEWABLE_ORDER_STATUSES,
                    has_purchased_product=True,
                )
            )
            if requested_order_id not in (None, ''):
                eligible_orders = eligible_orders.filter(id=requested_order_id)

            order = eligible_orders.order_by('-created_at', '-id').first()
            if not order:
                return Response(
                    {
                        'error': 'A delivered purchase of this product is required before reviewing it.',
                        'code': 'delivered_purchase_required',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if ReviewsReview.objects.filter(
                customer_ref=customer_ref,
                product_ref=product.id,
                order_id=order.id,
            ).exists():
                return Response(
                    {
                        'error': 'A review has already been submitted for this product and order.',
                        'code': 'review_already_submitted',
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            review = ReviewsReview.objects.create(
                customer_name=customer_name,
                product_name=product.name,
                customer_ref=customer_ref,
                product_ref=product.id,
                order_id=order.id,
                rating=rating,
                body=body,
                status='pending',
            )

        date_str = review.created_at.strftime('%b %d, %Y') if review.created_at else 'Recent'

        return Response({
            'message': 'Review submitted for moderation.',
            'review': {
                'id': review.id,
                'author': review.customer_name,
                'rating': review.rating,
                'comment': review.body,
                'date': date_str,
                'verified': True,
                'status': review.status,
            }
        }, status=status.HTTP_201_CREATED)


class PublicBannersAPIView(APIView):
    """Public customer and storefront endpoint returning active published banners."""
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        now = timezone.now()
        qs = CmsHomepageBanner.objects.filter(is_active=True)

        # Exclude scheduled banners whose starts_at is in the future
        qs = qs.filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now))
        # Exclude expired banners whose ends_at is in the past
        qs = qs.filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now))

        placement = request.query_params.get('placement')
        if placement:
            placement = placement.strip().lower()
            qs = qs.filter(placement__iexact=placement)

        banners = qs.order_by('order', 'id')
        data = [
            {
                'id': banner.id,
                'title': banner.title,
                'headline': banner.headline or banner.title,
                'subtext': banner.subtext or '',
                'button_label': banner.button_label or 'Shop Now',
                'placement': banner.placement,
                'placement_label': banner.get_placement_display(),
                'image_url': banner.image_url or '',
                'link_url': banner.link_url or '/shop',
                'order': banner.order,
            }
            for banner in banners
        ]
        return Response(data)

