import api from './client';

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
  expires_at?: string | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
  unread_count: number;
}

export const fetchNotifications = async (): Promise<NotificationListResponse> => {
  const { data } = await api.get('/api/notifications/');
  return data;
};

export const markNotificationRead = async (notificationId?: string): Promise<void> => {
  if (notificationId) {
    await api.post(`/api/notifications/${notificationId}/mark-read/`);
  } else {
    await api.post('/api/notifications/mark-read/');
  }
};

export const getUnreadCount = async (): Promise<number> => {
  const { data } = await api.get('/api/notifications/unread-count/');
  return data.unread_count || 0;
};




