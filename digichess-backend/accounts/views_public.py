from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import UserLookupSerializer
from accounts.serializers_detail import UserDetailSerializer

User = get_user_model()


def paginate_queryset(queryset, request, serializer_class):
    try:
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
    except ValueError:
        page, page_size = 1, 20
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    start = (page - 1) * page_size
    end = start + page_size
    total = queryset.count()
    data = serializer_class(queryset[start:end], many=True).data
    return {
        "results": data,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


class PublicUsersListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = User.objects.filter(is_active=True, is_bot=False)
        search = request.query_params.get("search")
        if search:
            qs = qs.filter(username__icontains=search) | qs.filter(email__icontains=search)

        sort = request.query_params.get("sort")
        allowed_sorts = {
            "username": "username",
            "-username": "-username",
            "rating_blitz": "rating_blitz",
            "-rating_blitz": "-rating_blitz",
            "rating_bullet": "rating_bullet",
            "-rating_bullet": "-rating_bullet",
            "rating_rapid": "rating_rapid",
            "-rating_rapid": "-rating_rapid",
            "rating_classical": "rating_classical",
            "-rating_classical": "-rating_classical",
            "date_joined": "date_joined",
            "-date_joined": "-date_joined",
        }
        if sort in allowed_sorts:
            qs = qs.order_by(allowed_sorts[sort])

        return Response(paginate_queryset(qs, request, UserLookupSerializer))


class PublicUserDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, username: str):
        user = User.objects.filter(username__iexact=username, is_active=True).first()
        if not user:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserDetailSerializer(user).data)
