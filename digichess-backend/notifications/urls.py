from django.urls import path
from .views import NotificationListView, NotificationMarkReadView, NotificationUnreadCountView

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification-list'),
    path('unread-count/', NotificationUnreadCountView.as_view(), name='notification-unread-count'),
    path('mark-read/', NotificationMarkReadView.as_view(), name='notification-mark-all-read'),
    path('<uuid:notification_id>/mark-read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
]







