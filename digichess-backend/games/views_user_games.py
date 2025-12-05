from django.contrib.auth import get_user_model
from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Game
from .serializers import GameSerializer
from .views_public import paginate_queryset, _parse_dt

User = get_user_model()


class UserGamesView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, username: str):
        user = get_object_or_404(User, username=username)
        
        # Get games where user is white or black
        qs = (
            Game.objects.filter(white=user) | Game.objects.filter(black=user)
        ).select_related("white", "black").distinct()
        
        # Filter by time control
        time_control = request.query_params.get("time_control")
        if time_control:
            qs = qs.filter(time_control=time_control)
        
        # Filter by status
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        
        # Filter by result (from user's perspective)
        result_filter = request.query_params.get("result")
        if result_filter:
            if result_filter == "win":
                qs = qs.filter(
                    models.Q(white=user, result=Game.RESULT_WHITE) |
                    models.Q(black=user, result=Game.RESULT_BLACK)
                )
            elif result_filter == "loss":
                qs = qs.filter(
                    models.Q(white=user, result=Game.RESULT_BLACK) |
                    models.Q(black=user, result=Game.RESULT_WHITE)
                )
            elif result_filter == "draw":
                qs = qs.filter(result=Game.RESULT_DRAW)
        
        # Filter by color
        color_filter = request.query_params.get("color")
        if color_filter == "white":
            qs = qs.filter(white=user)
        elif color_filter == "black":
            qs = qs.filter(black=user)
        
        # Filter by rated
        rated_filter = request.query_params.get("rated")
        if rated_filter is not None:
            rated_bool = rated_filter.lower() == "true"
            qs = qs.filter(rated=rated_bool)
        
        # Date range filters
        start = _parse_dt(request.query_params.get("start"))
        end = _parse_dt(request.query_params.get("end"))
        if start:
            qs = qs.filter(created_at__gte=start)
        if end:
            qs = qs.filter(created_at__lte=end)
        
        # Sort
        sort = request.query_params.get("sort", "-created_at")
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

