from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.db import DatabaseError
from datetime import datetime
from django.utils import timezone
import logging

from .models_rating_history import RatingHistory

logger = logging.getLogger(__name__)
User = get_user_model()


class UserRatingHistoryView(APIView):
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, username: str):
        user = User.objects.filter(username__iexact=username, is_active=True).first()
        if not user:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        mode = (request.query_params.get('mode', 'blitz') or 'blitz').lower()
        
        if mode not in ['bullet', 'blitz', 'rapid', 'classical']:
            return Response({"detail": "Invalid mode"}, status=400)
        
        # Date filters
        start_date = request.query_params.get('start')
        end_date = request.query_params.get('end')
        
        # Get current rating as well
        rating_field_map = {
            'bullet': 'rating_bullet',
            'blitz': 'rating_blitz',
            'rapid': 'rating_rapid',
            'classical': 'rating_classical'
        }
        current_rating = getattr(user, rating_field_map[mode], 800)

        try:
            qs = RatingHistory.objects.filter(user=user, mode=mode)

            if start_date:
                try:
                    start = datetime.fromisoformat(start_date).date()
                    qs = qs.filter(date__gte=start)
                except ValueError:
                    pass

            if end_date:
                try:
                    end = datetime.fromisoformat(end_date).date()
                    qs = qs.filter(date__lte=end)
                except ValueError:
                    pass

            # Order by snapshot time ascending (oldest first)
            qs = qs.order_by('recorded_at', 'created_at')

            # Format response
            history = []
            for entry in qs:
                history.append({
                    'date': entry.date.isoformat(),
                    'rating': entry.rating,
                    'recorded_at': entry.recorded_at.isoformat() if entry.recorded_at else None,
                    'created_at': entry.created_at.isoformat()
                })

            # Add current rating as today's entry if not already present
            today = timezone.localdate()
            if not qs.filter(date=today).exists():
                history.append({
                    'date': today.isoformat(),
                    'rating': current_rating,
                    'recorded_at': timezone.now().isoformat(),
                    'created_at': timezone.now().isoformat()
                })

        except DatabaseError as exc:
            logger.error("RatingHistory query failed: %s", exc, exc_info=True)
            history = []
            today = timezone.localdate()
            history.append({
                'date': today.isoformat(),
                'rating': current_rating,
                'recorded_at': timezone.now().isoformat(),
                'created_at': timezone.now().isoformat()
            })
        
        return Response({
            'mode': mode,
            'current_rating': current_rating,
            'history': history
        })




