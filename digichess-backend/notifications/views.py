from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q, Count
from django.utils import timezone
from datetime import timedelta

from .models import Notification
from .serializers import NotificationSerializer
from django.contrib.auth import get_user_model

User = get_user_model()


class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """Get user's notifications"""
        notifications = Notification.objects.filter(
            user=request.user,
            expires_at__isnull=True
        ) | Notification.objects.filter(
            user=request.user,
            expires_at__gte=timezone.now()
        )
        notifications = notifications.order_by('-created_at')[:50]
        
        serializer = NotificationSerializer(notifications, many=True)
        unread_count = Notification.objects.filter(
            user=request.user,
            read=False,
            expires_at__isnull=True
        ).count() + Notification.objects.filter(
            user=request.user,
            read=False,
            expires_at__gte=timezone.now()
        ).count()
        
        return Response({
            'notifications': serializer.data,
            'unread_count': unread_count
        })


class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, notification_id=None):
        """Mark a notification as read, or all if no ID provided"""
        if notification_id:
            try:
                notification = Notification.objects.get(id=notification_id, user=request.user)
                notification.mark_as_read()
                return Response({'status': 'marked as read'})
            except Notification.DoesNotExist:
                return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Mark all as read
            Notification.objects.filter(user=request.user, read=False).update(read=True)
            return Response({'status': 'all marked as read'})


class NotificationUnreadCountView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """Get unread notification count"""
        count = Notification.objects.filter(
            user=request.user,
            read=False,
            expires_at__isnull=True
        ).count() + Notification.objects.filter(
            user=request.user,
            read=False,
            expires_at__gte=timezone.now()
        ).count()
        return Response({'unread_count': count})


def create_notification(user, notification_type, title, message, data=None, expires_in_hours=None):
    """Helper function to create a notification"""
    expires_at = None
    if expires_in_hours:
        expires_at = timezone.now() + timedelta(hours=expires_in_hours)
    
    import sys
    print(f"[create_notification] Creating notification for user {user.id} ({user.username}): type={notification_type}, title={title}", file=sys.stdout)
    
    notification = Notification.objects.create(
        user=user,
        notification_type=notification_type,
        title=title,
        message=message,
        data=data or {},
        expires_at=expires_at
    )
    
    print(f"[create_notification] Notification created: id={notification.id}, user={notification.user.id}, read={notification.read}, data={notification.data}", file=sys.stdout)
    
    # Send WebSocket notification
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        if channel_layer:
            notification_data = NotificationSerializer(notification).data
            group_name = f"user_{user.id}"
            message = {
                "type": "notification",
                "notification": notification_data
            }
            async_to_sync(channel_layer.group_send)(group_name, message)
            import sys
            print(f"[notification] Sent WebSocket notification to {group_name}: {notification_type} for user {user.id}", file=sys.stdout)
        else:
            import sys
            print(f"[notification] Channel layer not available, notification saved but not sent via WebSocket", file=sys.stderr)
    except Exception as e:
        # If WebSocket fails, continue anyway (notification is still saved)
        import sys
        import traceback
        print(f"[notification] WebSocket error for user {user.id}: {e}", file=sys.stderr)
        print(f"[notification] Traceback: {traceback.format_exc()}", file=sys.stderr)
    
    return notification

