from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from utils.redis_client import get_redis


class PingView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        user.is_online = True
        user.last_seen_at = timezone.now()
        user.save(update_fields=["is_online", "last_seen_at"])
        try:
            r = get_redis()
            r.setex(f"presence:user:{user.id}", 90, "1")
        except Exception:
            pass
        return Response({"detail": "pong"}, status=status.HTTP_200_OK)
