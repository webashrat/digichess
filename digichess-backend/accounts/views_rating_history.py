from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Q
from datetime import datetime
from django.utils import timezone

from .models import User
from .models_rating_history import RatingHistory


class UserRatingHistoryView(APIView):
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, username: str):
        user = get_object_or_404(User, username=username)
        mode = request.query_params.get('mode', 'blitz')
        
        if mode not in ['bullet', 'blitz', 'rapid', 'classical']:
            return Response({"detail": "Invalid mode"}, status=400)
        
        # Date filters
        start_date = request.query_params.get('start')
        end_date = request.query_params.get('end')
        
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
        
        # Order by date ascending (oldest first)
        qs = qs.order_by('date')
        
        # Get current rating as well
        rating_field_map = {
            'bullet': 'rating_bullet',
            'blitz': 'rating_blitz',
            'rapid': 'rating_rapid',
            'classical': 'rating_classical'
        }
        current_rating = getattr(user, rating_field_map[mode], 800)
        
        # Format response
        history = []
        for entry in qs:
            history.append({
                'date': entry.date.isoformat(),
                'rating': entry.rating,
                'created_at': entry.created_at.isoformat()
            })
        
        # Add current rating as today's entry if not already present
        today = timezone.now().astimezone(timezone.utc).date()
        if not qs.filter(date=today).exists():
            history.append({
                'date': today.isoformat(),
                'rating': current_rating,
                'created_at': timezone.now().isoformat()
            })
        
        return Response({
            'mode': mode,
            'current_rating': current_rating,
            'history': history
        })




