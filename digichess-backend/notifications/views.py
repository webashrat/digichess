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
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 10))
        except ValueError:
            page, page_size = 1, 10
        page = max(page, 1)
        page_size = max(min(page_size, 50), 1)
        start = (page - 1) * page_size
        end = start + page_size

        notifications = Notification.objects.filter(
            user=request.user,
            expires_at__isnull=True
        ) | Notification.objects.filter(
            user=request.user,
            expires_at__gte=timezone.now()
        )
        notifications = notifications.order_by('-created_at')
        filtered = []
        for note in notifications:
            if note.notification_type == "game_challenge":
                from_user_id = note.data.get("from_user_id")
                from_username = note.data.get("from_username")
                from_email = note.data.get("from_email")
                if (
                    (from_user_id is not None and str(from_user_id) == str(request.user.id))
                    or (from_username and request.user.username and str(from_username) == str(request.user.username))
                    or (from_email and request.user.email and str(from_email).lower() == str(request.user.email).lower())
                ):
                    continue
            filtered.append(note)
        total = len(filtered)
        page_items = filtered[start:end]
        
        serializer = NotificationSerializer(page_items, many=True)
        unread_count = sum(1 for note in filtered if not note.read)
        
        return Response({
            'results': serializer.data,
            'page': page,
            'page_size': page_size,
            'total': total,
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
        notifications = Notification.objects.filter(
            user=request.user,
            read=False,
            expires_at__isnull=True
        ) | Notification.objects.filter(
            user=request.user,
            read=False,
            expires_at__gte=timezone.now()
        )
        filtered = []
        for note in notifications:
            if note.notification_type == "game_challenge":
                from_user_id = note.data.get("from_user_id")
                from_username = note.data.get("from_username")
                from_email = note.data.get("from_email")
                if (
                    (from_user_id is not None and str(from_user_id) == str(request.user.id))
                    or (from_username and request.user.username and str(from_username) == str(request.user.username))
                    or (from_email and request.user.email and str(from_email).lower() == str(request.user.email).lower())
                ):
                    continue
            filtered.append(note)
        return Response({'unread_count': len(filtered)})


class NotificationDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, notification_id):
        try:
            notification = Notification.objects.get(id=notification_id, user=request.user)
        except Notification.DoesNotExist:
            return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)
        notification.delete()
        return Response({'status': 'deleted'}, status=status.HTTP_200_OK)


def create_notification(user, notification_type, title, message, data=None, expires_in_hours=None):
    """Helper function to create a notification"""
    if notification_type == "game_challenge" and data:
        try:
            from_user_id = data.get("from_user_id")
            if from_user_id is not None and str(from_user_id) == str(user.id):
                return None
        except Exception:
            pass
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

