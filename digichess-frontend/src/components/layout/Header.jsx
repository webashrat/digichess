import React, { useState } from 'react';
import clsx from 'clsx';
import useNotifications from '../../hooks/useNotifications';
import { acceptGame, rejectGame, respondFriendRequest } from '../../api';
import { useNavigate } from 'react-router-dom';

const defaultSegments = [
    { id: 'bullet', label: 'Bullet' },
    { id: 'blitz', label: 'Blitz' },
    { id: 'rapid', label: 'Rapid' },
    { id: 'classical', label: 'Classical' },
];

export default function Header({
    title = "Leaderboards",
    mode = 'blitz',
    onModeChange,
    segments = defaultSegments,
    showBack = false,
    onBack,
    rightAction = "notifications",
    onRightAction,
    rightBadge = null,
}) {
    const {
        unreadCount,
        notifications,
        markAllRead,
        removeNotification,
        page: notificationsPage,
        totalPages: notificationsTotalPages,
        total: notificationsTotal,
        setPage: setNotificationsPage,
    } = useNotifications({ pageSize: 10 });
    const [showNotifications, setShowNotifications] = useState(false);
    const navigate = useNavigate();
    const handleBack = onBack || (() => window.history.back());
    const showRightAction = Boolean(rightAction);
    const showBadge = rightBadge ?? (rightAction === 'notifications' && unreadCount > 0);
    const handleRight = onRightAction || (rightAction === 'notifications' ? () => {
        setShowNotifications((prev) => {
            const next = !prev;
            if (next) setNotificationsPage(1);
            return next;
        });
        markAllRead();
    } : null);

    const handleNotificationAction = async (notification, decision) => {
        if (!notification) return;
        try {
            if (notification.notification_type === 'game_challenge') {
                const gameId = notification.data?.game_id;
                if (gameId) {
                    if (decision === 'accept') {
                        await acceptGame(gameId);
                        navigate(`/game/${gameId}`);
                    } else {
                        await rejectGame(gameId);
                    }
                }
            }
            if (notification.notification_type === 'friend_request') {
                const requestId = notification.data?.friend_request_id;
                if (requestId) {
                    await respondFriendRequest(requestId, decision);
                }
            }
        } catch (err) {
            // ignore
        } finally {
            removeNotification(notification.id);
        }
    };
    return (
        <header className="bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm shrink-0 sticky top-0 z-50">
            <div className="flex items-center justify-between px-4 py-3">
                {showBack ? (
                    <button
                        onClick={handleBack}
                        className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                        aria-label="Back"
                        type="button"
                    >
                        <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                    </button>
                ) : (
                    <div className="w-10" />
                )}
                <h1 className="text-lg font-bold tracking-tight">{title}</h1>
                {showRightAction ? (
                    <button
                        className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 relative transition-colors"
                        type="button"
                        aria-label="Header action"
                        onClick={handleRight}
                    >
                        <span className="material-symbols-outlined text-[24px]">{rightAction}</span>
                        {showBadge ? (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-background-light dark:border-background-dark"></span>
                        ) : null}
                    </button>
                ) : (
                    <div className="w-10" />
                )}
            </div>

            {showNotifications && rightAction === 'notifications' ? (
                <div className="px-4 pb-4">
                    <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold">Notifications</h4>
                            <button
                                className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
                                type="button"
                                onClick={() => setShowNotifications(false)}
                            >
                                <span className="material-symbols-outlined text-base">close</span>
                            </button>
                        </div>
                        {notifications.length ? (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {notifications.map((note) => (
                                    <div key={note.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="font-semibold">{note.title || 'Notification'}</div>
                                                <div className="text-slate-500 mt-1">{note.message || 'Update available.'}</div>
                                            </div>
                                            <button
                                                type="button"
                                                className="text-slate-400 hover:text-red-500"
                                                onClick={() => removeNotification(note.id)}
                                                title="Delete notification"
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                            </button>
                                        </div>
                                        {note.notification_type === 'game_challenge' ? (
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    className="px-2 py-1 rounded bg-primary text-white text-[10px] font-semibold"
                                                    type="button"
                                                    onClick={() => handleNotificationAction(note, 'accept')}
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold"
                                                    type="button"
                                                    onClick={() => handleNotificationAction(note, 'decline')}
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                        ) : null}
                                        {note.notification_type === 'friend_request' ? (
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    className="px-2 py-1 rounded bg-primary text-white text-[10px] font-semibold"
                                                    type="button"
                                                    onClick={() => handleNotificationAction(note, 'accept')}
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold"
                                                    type="button"
                                                    onClick={() => handleNotificationAction(note, 'decline')}
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500">There are no notifications.</div>
                        )}
                        {notificationsTotal > 10 ? (
                            <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                                <button
                                    type="button"
                                    className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-800 font-semibold disabled:opacity-50"
                                    onClick={() => setNotificationsPage((prev) => Math.max(1, prev - 1))}
                                    disabled={notificationsPage <= 1}
                                >
                                    Prev
                                </button>
                                <div className="flex flex-col items-center gap-1">
                                    <div>
                                        Showing {(notificationsPage - 1) * 10 + 1}-{Math.min(notificationsTotal, notificationsPage * 10)} of {notificationsTotal}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span>Page</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={notificationsTotalPages}
                                            value={notificationsPage}
                                            onChange={(event) => {
                                                const value = Number(event.target.value);
                                                if (!Number.isFinite(value)) return;
                                                setNotificationsPage(Math.min(Math.max(1, value), notificationsTotalPages));
                                            }}
                                            className="w-12 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5 text-center text-[10px]"
                                        />
                                        <span>of {notificationsTotalPages}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-800 font-semibold disabled:opacity-50"
                                    onClick={() => setNotificationsPage((prev) => Math.min(notificationsTotalPages, prev + 1))}
                                    disabled={notificationsPage >= notificationsTotalPages}
                                >
                                    Next
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {segments && segments.length > 0 && onModeChange ? (
                <div className="px-4 pb-4">
                    <div className="flex p-1 bg-slate-200 dark:bg-surface-dark rounded-xl">
                        {segments.map((segment) => (
                            <button
                                key={segment.id}
                                onClick={() => onModeChange(segment.id)}
                                className={clsx(
                                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                                    mode === segment.id
                                        ? "bg-white dark:bg-primary shadow-sm text-slate-900 dark:text-white font-semibold"
                                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                )}
                                type="button"
                            >
                                {segment.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </header>
    );
}
