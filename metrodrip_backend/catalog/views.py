from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.renderers import JSONRenderer
from django.db.models import Q

from .models import CatalogProduct, CatalogCategory, CatalogProductVariant, InventoryStockEntry
from orders.models import ReviewsReview
from identity.models import AccountsCustomer
from identity.authentication import CustomerAuthentication

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
        qs = CatalogProduct.objects.filter(is_active=True)

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
    queryset = CatalogProduct.objects.all()
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
            is_active=True
        )

class VariantStockAPIView(ListAPIView):
    serializer_class = VariantStockSerializer
    renderer_classes = [JSONRenderer]

    def get_queryset(self):
        return InventoryStockEntry.objects.filter(
            variant_id=self.kwargs['variant_id']
        )


class ProductReviewsAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def get(self, request, product_id):
        product = CatalogProduct.objects.filter(id=product_id).first()
        if not product:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        reviews_qs = ReviewsReview.objects.filter(
            product_ref=product_id
        ).exclude(status='rejected').order_by('-created_at')

        review_list = list(reviews_qs)
        total_count = len(review_list)

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
                'verified': bool(rev.order_id or rev.customer_ref),
                'merchant_reply': rev.merchant_reply or '',
                'status': rev.status,
            })

        avg_rating = round(total_rating / total_count, 1) if total_count > 0 else 5.0

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
        product = CatalogProduct.objects.filter(id=product_id).first()
        if not product:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Determine author
        customer_ref = None
        if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and isinstance(request.user, AccountsCustomer):
            customer_name = request.user.name
            customer_ref = request.user.id
        else:
            customer_name = (
                request.data.get('author')
                or request.data.get('customer_name')
                or 'Verified Buyer'
            ).strip()
            raw_cid = request.data.get('customer_id') or request.data.get('customer_ref')
            if raw_cid:
                try:
                    customer_ref = int(raw_cid)
                except (ValueError, TypeError):
                    pass

        try:
            rating = int(request.data.get('rating', 5))
            if rating < 1 or rating > 5:
                return Response({'error': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({'error': 'Rating must be an integer between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        body = (request.data.get('comment') or request.data.get('body') or '').strip()
        if not body:
            return Response({'error': 'Review comment is required.'}, status=status.HTTP_400_BAD_REQUEST)

        order_id = request.data.get('order_id')
        if order_id:
            try:
                order_id = int(order_id)
            except (ValueError, TypeError):
                order_id = None

        review = ReviewsReview.objects.create(
            customer_name=customer_name,
            product_name=product.name,
            customer_ref=customer_ref,
            product_ref=product.id,
            order_id=order_id,
            rating=rating,
            body=body,
            status='approved',
        )

        date_str = review.created_at.strftime('%b %d, %Y') if review.created_at else 'Recent'

        return Response({
            'message': 'Review submitted successfully.',
            'review': {
                'id': review.id,
                'author': review.customer_name,
                'rating': review.rating,
                'comment': review.body,
                'date': date_str,
                'verified': bool(review.order_id or review.customer_ref),
                'status': review.status,
            }
        }, status=status.HTTP_201_CREATED)