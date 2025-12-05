from django.db.models import F
from django.db.models import Q
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.serializers import UserLookupSerializer


def paginate(queryset, request):
    try:
        limit = int(request.query_params.get("limit", 10))
    except ValueError:
        limit = 10
    limit = max(1, min(limit, 100))
    page = int(request.query_params.get("page", 1)) if request.query_params.get("page") else 1
    page = max(1, page)
    start = (page - 1) * limit
    end = start + limit
    total = queryset.count()
    return {"results": queryset[start:end], "total": total, "page": page, "limit": limit}


class RatingLeaderboardView(APIView):
    permission_classes = [permissions.AllowAny]

    rating_field_map = {
        "bullet": ("rating_bullet", "rating_bullet_rd"),
        "blitz": ("rating_blitz", "rating_blitz_rd"),
        "rapid": ("rating_rapid", "rating_rapid_rd"),
        "classical": ("rating_classical", "rating_classical_rd"),
    }

    def get(self, request):
        mode = request.query_params.get("mode", "blitz")
        fields = self.rating_field_map.get(mode)
        if not fields:
            return Response({"detail": "Invalid mode"}, status=400)
        r_field, rd_field = fields
        qs = User.objects.filter(is_active=True, is_bot=False).order_by(F(r_field).desc(), F(rd_field).asc(), "username")
        page = paginate(qs, request)
        data = UserLookupSerializer(page["results"], many=True).data
        # include rating in response
        for item in data:
            user = qs.get(id=item["id"])
            item["rating"] = getattr(user, r_field, 0)
        return Response(
            {
                "mode": mode,
                "total": page["total"],
                "page": page["page"],
                "limit": page["limit"],
                "results": data,
            }
        )


class DigiQuizLeaderboardView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = User.objects.filter(is_active=True, is_bot=False).order_by(
            F("rating_digiquiz").desc(), F("digiquiz_correct").desc(), "username"
        )
        page = paginate(qs, request)
        data = UserLookupSerializer(page["results"], many=True).data
        for item in data:
            user = qs.get(id=item["id"])
            item["rating_digiquiz"] = user.rating_digiquiz
            item["digiquiz_correct"] = user.digiquiz_correct
            item["digiquiz_wrong"] = user.digiquiz_wrong
        return Response(
            {
                "mode": "digiquiz",
                "total": page["total"],
                "page": page["page"],
                "limit": page["limit"],
                "results": data,
            }
        )
