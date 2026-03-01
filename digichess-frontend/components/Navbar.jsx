'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, X, Trash2, Settings, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import useNotifications from '@/hooks/useNotifications';
import SettingsModal from '@/components/SettingsModal';
import {
  acceptGame,
  acceptRematch,
  rejectGame,
  rejectRematch,
  respondFriendRequest,
} from '@/lib/api';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const notifRef = useRef(null);

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

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationAction = async (notification, decision) => {
    if (!notification) return;
    try {
      if (notification.notification_type === 'game_challenge') {
        const gameId = notification.data?.game_id;
        if (gameId) {
          if (decision === 'accept') {
            await acceptGame(gameId);
            router.push(`/game/${gameId}`);
          } else {
            await rejectGame(gameId);
          }
        }
      }
      if (notification.notification_type === 'rematch_requested') {
        const gameId = notification.data?.original_game_id || notification.data?.game_id;
        if (gameId) {
          if (decision === 'accept') {
            const response = await acceptRematch(gameId);
            if (response?.id) router.push(`/game/${response.id}`);
          } else {
            await rejectRematch(gameId);
          }
        }
      }
      if (notification.notification_type === 'friend_request') {
        const requestId = notification.data?.friend_request_id;
        if (requestId) await respondFriendRequest(requestId, decision);
      }
    } catch (err) {
      if (notification.notification_type === 'game_challenge' && decision === 'accept' && err?.status === 400) {
        setNotificationError('Challenge is no longer available.');
      }
    } finally {
      removeNotification(notification.id);
    }
  };

  const showInLayout = !pathname?.startsWith('/game/') && pathname !== '/login' && pathname !== '/signup';

  if (!showInLayout) return null;

  return (
    <header className="sticky ">
      <div className=" mr-0 mb-2 flex items-center justify-end h-14">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Login/Signup — only when NOT authenticated */}
          {!isAuthenticated && (
            <Link
              href="/signup"
              className="px-3 py-1.5 rounded-full bg-primary text-white text-sm font-semibold shadow-sm hover:bg-blue-600"
            >
              Sign up
            </Link>
          )}

          {/* Notifications — only when authenticated */}
          {isAuthenticated && (
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 relative"
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  if (!notificationsOpen) setNotificationsPage(1);
                  markAllRead();
                }}
              >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-background-light dark:border-background-dark" />
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-1 w-[min(90vw,20rem)] bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 max-h-80 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">Notifications</h4>
                    <button type="button" className="p-1 rounded-full hover:bg-slate-200" onClick={() => setNotificationsOpen(false)}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {notificationError && <div className="mb-2 text-[11px] text-amber-500">{notificationError}</div>}
                  {notifications.length ? (
                    <div className="space-y-2">
                      {notifications.map((note) => (
                        <div key={note.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs">
                          <div className="flex justify-between gap-2">
                            <div>
                              <div className="font-semibold">{note.title || 'Notification'}</div>
                              <div className="text-slate-500 mt-1">{note.message || 'Update available.'}</div>
                            </div>
                            <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => removeNotification(note.id)}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {(note.notification_type === 'game_challenge' || note.notification_type === 'rematch_requested' || note.notification_type === 'friend_request') && (
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                className="px-2 py-1 rounded bg-primary text-white text-[10px] font-semibold"
                                onClick={() => handleNotificationAction(note, 'accept')}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold"
                                onClick={() => handleNotificationAction(note, 'decline')}
                              >
                                Decline
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">No notifications.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mobile logout — only on small screens when authenticated */}
          {isAuthenticated && (
            <button
              type="button"
              className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-600 dark:text-slate-300 md:hidden"
              onClick={async () => { await logout(); router.push('/'); }}
              title="Log out"
            >
              <LogOut className="w-5 h-5 text-red-500" />
            </button>
          )}

          {/* Settings icon — always visible */}
          <button
            type="button"
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Settings modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
