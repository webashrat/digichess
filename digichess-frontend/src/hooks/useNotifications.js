import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteNotification, fetchNotifications, fetchUnreadNotifications, markAllNotificationsRead } from '../api';
import { tokenStorage } from '../api/client';
import { useAuth } from '../context/AuthContext';

const resolveWsBase = () => {
    const explicit = import.meta.env.VITE_WS_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (apiBase && apiBase.startsWith('http')) {
        try {
            const url = new URL(apiBase);
            const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
            return `${protocol}://${url.host}`;
        } catch (err) {
            // ignore invalid API base
        }
    }
    if (typeof window !== 'undefined') {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalhost) {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            return `${protocol}://${window.location.hostname}:8000`;
        }
    }
    return null;
};

const buildWsUrl = (path, token) => {
    const base = resolveWsBase();
    if (base) {
        return `${base}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

export default function useNotifications(options = {}) {
    const { user, token, isAuthenticated } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [page, setPage] = useState(1);
    const pageSize = options.pageSize || 10;
    const [total, setTotal] = useState(0);
    const wsRef = useRef(null);
    const handlersRef = useRef({
        onMatchFound: options.onMatchFound,
        onEnqueued: options.onEnqueued,
        onMmStatus: options.onMmStatus,
    });

    useEffect(() => {
        handlersRef.current = {
            onMatchFound: options.onMatchFound,
            onEnqueued: options.onEnqueued,
            onMmStatus: options.onMmStatus,
        };
    }, [options.onMatchFound, options.onEnqueued, options.onMmStatus]);

    useEffect(() => {
        if (!isAuthenticated) {
            setUnreadCount(0);
            setNotifications([]);
            return;
        }
        fetchUnreadNotifications()
            .then((data) => setUnreadCount(data?.unread_count || 0))
            .catch(() => {});
        fetchNotifications({ page, page_size: pageSize })
            .then((data) => {
                const items = data?.results || data?.notifications || [];
                const filtered = user?.id
                    ? items.filter((note) => {
                        if (note.notification_type !== 'game_challenge') return true;
                        const fromUserId = note.data?.from_user_id;
                        const fromUsername = note.data?.from_username;
                        const fromEmail = note.data?.from_email;
                        if (fromUserId != null && String(fromUserId) === String(user.id)) return false;
                        if (fromUsername && user?.username && String(fromUsername) === String(user.username)) return false;
                        if (fromEmail && user?.email && String(fromEmail).toLowerCase() === String(user.email).toLowerCase()) return false;
                        return true;
                    })
                    : items;
                const filteredOut = items.length - filtered.length;
                setNotifications(filtered);
                const baseTotal = data?.total ?? items.length;
                setTotal(Math.max(0, baseTotal - filteredOut));
            })
            .catch(() => {});
    }, [isAuthenticated, page, pageSize, user?.id]);

    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;
        const authToken = token || tokenStorage.get();
        const ws = new WebSocket(buildWsUrl(`/ws/user/${user.id}/`, authToken));
        wsRef.current = ws;
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data?.type === 'notification' && data?.notification) {
                    const notification = data.notification;
                    if (notification.notification_type === 'game_challenge') {
                        const fromUserId = notification.data?.from_user_id;
                        const fromUsername = notification.data?.from_username;
                        const fromEmail = notification.data?.from_email;
                        if (fromUserId != null && String(fromUserId) === String(user?.id)) return;
                        if (fromUsername && user?.username && String(fromUsername) === String(user.username)) return;
                        if (fromEmail && user?.email && String(fromEmail).toLowerCase() === String(user.email).toLowerCase()) return;
                    }
                    setNotifications((prev) => [notification, ...prev]);
                    setUnreadCount((prev) => prev + 1);
                    setTotal((prev) => prev + 1);
                    return;
                }
                if (data?.type) {
                    const rematchType = data.type;
                    if (rematchType === 'rematch_accepted' || rematchType === 'rematch_rejected') {
                        const originalId = data.original_game_id ?? data.game_id ?? null;
                        if (originalId != null) {
                            setNotifications((prev) => {
                                const idsToRemove = new Set(
                                    prev
                                        .filter((note) => (
                                            note.notification_type === 'rematch_requested'
                                            && String(note.data?.original_game_id ?? note.data?.game_id) === String(originalId)
                                        ))
                                        .map((note) => note.id)
                                );
                                if (!idsToRemove.size) return prev;
                                const removedUnread = prev.filter(
                                    (note) => idsToRemove.has(note.id) && !note.read
                                ).length;
                                idsToRemove.forEach((id) => {
                                    deleteNotification(id).catch(() => {});
                                });
                                setUnreadCount((current) => Math.max(0, current - removedUnread));
                                setTotal((current) => Math.max(0, current - idsToRemove.size));
                                return prev.filter((note) => !idsToRemove.has(note.id));
                            });
                        }
                        return;
                    }
                }
                if (data?.type === 'match_found') {
                    handlersRef.current.onMatchFound?.(data.game_id, data);
                    return;
                }
                if (data?.type === 'enqueued') {
                    handlersRef.current.onEnqueued?.(data);
                }
                if (data?.type === 'mm_status') {
                    handlersRef.current.onMmStatus?.(data);
                }
            } catch (err) {
                // ignore parse errors
            }
        };
        ws.onclose = () => {
            wsRef.current = null;
        };
        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [isAuthenticated, token, user?.id]);

    const markAllRead = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            await markAllNotificationsRead();
            setUnreadCount(0);
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        } catch (err) {
            // ignore
        }
    }, [isAuthenticated]);

    const removeNotification = useCallback(async (notificationId) => {
        if (!notificationId) return;
        const target = notifications.find((n) => n.id === notificationId);
        try {
            await deleteNotification(notificationId);
        } catch (err) {
            // ignore delete errors
        } finally {
            setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
            if (target && !target.read) {
                setUnreadCount((prev) => Math.max(0, prev - 1));
            }
            setTotal((prev) => Math.max(0, prev - 1));
        }
    }, [notifications]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, total, pageSize]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return useMemo(() => ({
        unreadCount,
        notifications,
        markAllRead,
        removeNotification,
        page,
        pageSize,
        total,
        totalPages,
        setPage,
    }), [unreadCount, notifications, markAllRead, removeNotification, page, pageSize, total, totalPages]);
}
