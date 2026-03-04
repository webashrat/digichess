import React from 'react';

const ACTIONABLE_TYPES = ['game_challenge', 'rematch_requested', 'friend_request'];

export default function NotificationCard({ notification, onAction, onRemove }) {
    if (!notification) return null;
    const hasActions = ACTIONABLE_TYPES.includes(notification.notification_type);

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs animate-fade-in">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="font-semibold">{notification.title || 'Notification'}</div>
                    <div className="text-slate-500 mt-1">{notification.message || 'Update available.'}</div>
                </div>
                <button
                    type="button"
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    onClick={() => onRemove?.(notification.id)}
                    aria-label="Delete notification"
                >
                    <span className="material-symbols-outlined text-base">delete</span>
                </button>
            </div>
            {hasActions ? (
                <div className="flex gap-2 mt-2">
                    <button
                        className="px-2.5 py-1 rounded-lg bg-primary text-white text-[10px] font-semibold hover:bg-blue-600 transition-colors"
                        type="button"
                        onClick={() => onAction?.(notification, 'accept')}
                    >
                        Accept
                    </button>
                    <button
                        className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                        type="button"
                        onClick={() => onAction?.(notification, 'decline')}
                    >
                        Decline
                    </button>
                </div>
            ) : null}
        </div>
    );
}
