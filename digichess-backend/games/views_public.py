from datetime import datetime

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Game
from .serializers import GameSerializer


def _parse_dt(param: str):
    try:
        return datetime.fromisoformat(param)
    except Exception:
        return None


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


class PublicGamesListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = Game.objects.all()
        time_control = request.query_params.get("time_control")
        if time_control:
            qs = qs.filter(time_control=time_control)

        start = _parse_dt(request.query_params.get("start"))
        end = _parse_dt(request.query_params.get("end"))
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        sort = request.query_params.get("sort")
        allowed_sorts = {
            "created_at": "created_at",
            "-created_at": "-created_at",
            "time_control": "time_control",
            "-time_control": "-time_control",
            "status": "status",
            "-status": "-status",
        }
        if sort in allowed_sorts:
            qs = qs.order_by(allowed_sorts[sort])
        else:
            qs = qs.order_by("-created_at")

        return Response(paginate_queryset(qs, request, GameSerializer))
