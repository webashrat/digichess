import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import { listThreads } from '../api/social';
import { listPublicGames, acceptChallenge, rejectChallenge, rematchAccept, rematchReject } from '../api/games';
import { fetchNotifications, markNotificationRead, Notification as ApiNotification } from '../api/notifications';
import { makeWsUrl } from '../utils/ws';
import { setHashRoute } from '../utils/hashNavigate';

type Notification = { id: string; type: 'message' | 'challenge' | 'notification'; text: string; action?: 'accept' | 'reject'; gameId?: number; title?: string; read?: boolean; notificationType?: string };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [viewedNotificationIds, setViewedNotificationIds] = useState<Set<string>>(new Set());
  const [ignoredChallenges, setIgnoredChallenges] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem('dc_ignored_chals');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [ignoredIds, setIgnoredIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('dc_seen_notifs');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const persistIgnored = (chals: number[], ids: string[]) => {
    try {
      localStorage.setItem('dc_ignored_chals', JSON.stringify(chals));
      localStorage.setItem('dc_seen_notifs', JSON.stringify(ids));
    } catch {
      // ignore
    }
  };

  const wsRef = useRef<WebSocket | null>(null);

  const load = () => {
    if (!meId) return;
    
    // Load notifications from API
    fetchNotifications()
      .then((response) => {
        console.log('[NotificationBell] API response:', JSON.stringify(response, null, 2));
        console.log('[NotificationBell] Raw notifications count:', response.notifications?.length || 0);
        console.log('[NotificationBell] Raw notifications:', response.notifications);
        console.log('[NotificationBell] Ignored IDs:', ignoredIds);
        console.log('[NotificationBell] Ignored challenges:', ignoredChallenges);
        
        // Log each notification in detail
        if (response.notifications && response.notifications.length > 0) {
          response.notifications.forEach((n: ApiNotification, idx: number) => {
            console.log(`[NotificationBell] Notification ${idx}:`, {
              id: n.id,
              type: n.notification_type,
              title: n.title,
              message: n.message,
              read: n.read,
              data: n.data,
              game_id: n.data?.game_id
            });
          });
        } else {
          console.warn('[NotificationBell] No notifications in API response!');
        }
        
        const apiNotifs: Notification[] = (response.notifications || [])
          .filter((n: ApiNotification) => {
            console.log('[NotificationBell] Processing notification:', {
              id: n.id,
              type: n.notification_type,
              read: n.read,
              gameId: n.data?.game_id,
              isRead: n.read,
              isIgnored: ignoredIds.includes(n.id),
              isChallengeIgnored: n.notification_type === 'game_challenge' && ignoredChallenges.includes(n.data?.game_id)
            });
            
            // Filter out read notifications and ignored IDs
            if (n.read) {
              console.log('[NotificationBell] Filtered out (read):', n.id);
              return false;
            }
            if (ignoredIds.includes(n.id)) {
              console.log('[NotificationBell] Filtered out (ignored ID):', n.id);
              return false;
            }
            // Filter out challenge_rejected notifications (these are for the challenger, not the rejector)
            if (n.notification_type === 'challenge_rejected') {
              // Only show if it's not for a game we've already rejected
              const gameId = n.data?.game_id;
              if (gameId && ignoredChallenges.includes(gameId)) {
                console.log('[NotificationBell] Filtered out (challenge rejected, game ignored):', n.id);
                return false;
              }
            }
            // For game_challenge notifications, we should show them unless:
            // 1. The notification itself is ignored (already checked above)
            // 2. The notification is read (already checked above)
            // We should NOT filter based on ignoredChallenges alone, because:
            // - A new challenge for a game should always show, even if we previously interacted with that game
            // - The ignoredChallenges list is meant to prevent duplicate notifications, not hide new ones
            // Only filter if the notification ID itself is in ignoredIds (which is already checked above)
            console.log('[NotificationBell] Notification passed filter:', n.id);
            return true;
          })
          .map((n: ApiNotification) => {
            let gameId: number | undefined;
            let action: 'accept' | undefined = undefined;
            let notificationType: string | undefined = undefined;
            const isOutgoingChallenge = n.notification_type === 'game_challenge'
              && n.data?.from_user_id
              && meId
              && n.data.from_user_id === meId;
            if (n.notification_type === 'game_challenge' && n.data?.game_id) {
              gameId = n.data.game_id;
              action = isOutgoingChallenge ? undefined : 'accept';
              notificationType = isOutgoingChallenge ? undefined : 'game_challenge';
            } else if (n.notification_type === 'rematch_requested' || n.notification_type === 'rematch') {
              // For rematch, use original_game_id or game_id
              gameId = n.data?.original_game_id || n.data?.game_id;
              console.log('[NotificationBell] Processing rematch notification:', {
                notification_type: n.notification_type,
                data: n.data,
                original_game_id: n.data?.original_game_id,
                game_id: n.data?.game_id,
                extracted_gameId: gameId
              });
              if (gameId) {
                action = 'accept';
                notificationType = n.notification_type === 'rematch' ? 'rematch_requested' : n.notification_type;
              } else {
                // Debug: log if gameId is missing
                console.warn('Rematch notification missing gameId:', n);
              }
            }
            return {
              id: n.id,
              type: 'notification' as const,
              text: n.message,
              title: n.title,
              read: n.read,
              gameId,
              action,
              notificationType
            };
          });
        
        console.log('[NotificationBell] Processed API notifications:', apiNotifs);
        
        // Messages: show latest preview from threads
        listThreads()
          .then((threads) => {
            const msgs: Notification[] = (threads || [])
              .map((t: any) => {
                const last = t.last_message || t.preview || t.last_message_content;
                if (!last) return null;
                const sender = t.last_sender || t.last_sender_username || '';
                return { id: `msg-${t.id}`, type: 'message' as const, text: `${sender ? sender + ': ' : ''}${last}` };
              })
              .filter(Boolean)
              .filter((n: Notification) => !ignoredIds.includes(n.id)) as Notification[];
            
            const allItems = [...apiNotifs, ...msgs];
            console.log('[NotificationBell] Setting items:', allItems);
            setItems(allItems);
          })
          .catch(() => {
            console.log('[NotificationBell] Setting items (no messages):', apiNotifs);
            setItems(apiNotifs);
          });
      })
      .catch((err) => {
        console.error('Failed to load notifications:', err);
        // Fallback to old method if API fails
        const handleGames = (games: any[]) => {
          const challenges: Notification[] = games
            .filter((g: any) => {
              const isWhite = g.white?.id === meId;
              const isBlack = g.black?.id === meId;
              const otherSide = isWhite ? g.black : isBlack ? g.white : null;
              const isCreator = g.creator?.id === meId;
              return (isWhite || isBlack) && otherSide && !isCreator && !ignoredChallenges.includes(g.id);
            })
            .map((g: any) => {
              const isWhite = g.white?.id === meId;
              const opponent = isWhite ? g.black : g.white;
              const timeText = g.time_control
                ? `${g.time_control} ${g.white_time_seconds ?? ''}/${g.black_time_seconds ?? ''}`
                : `${g.white_time_seconds ?? '?'}s / ${g.black_time_seconds ?? '?'}`;
              return {
                id: `chal-${g.id}`,
                type: 'challenge' as const,
                text: `Challenge: ${g.time_control || g.mode || 'game'} • ${timeText} vs ${opponent?.username || 'opponent'}`,
                action: 'accept' as const,
                gameId: g.id
              };
            });
          setItems(challenges);
        };
        api
          .get('/api/games/', { params: { status: 'pending', page_size: 50 } })
          .then((res) => handleGames(res.data.results || res.data || []))
          .catch(() => {});
      });
  };

  useEffect(() => {
    api
      .get('/api/accounts/me/')
      .then((r) => setMeId(r.data.id))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!meId) return;
    load();
    const t = setInterval(load, 10000);
    
    // Connect to WebSocket for real-time notifications
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      const wsUrl = token 
        ? makeWsUrl(`/ws/user/${meId}/?token=${encodeURIComponent(token)}`)
        : makeWsUrl(`/ws/user/${meId}/`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        console.log('[NotificationBell] WebSocket connected for user notifications');
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[NotificationBell] Received WebSocket message:', data);
          if (data.type === 'notification' && data.notification) {
            // New notification received via WebSocket
            const n = data.notification;
            console.log('[NotificationBell] Processing notification:', n);
            let gameId: number | undefined;
            let action: 'accept' | undefined = undefined;
            let notificationType: string | undefined = n.notification_type;
            const isOutgoingChallenge = n.notification_type === 'game_challenge'
              && n.data?.from_user_id
              && meId
              && n.data.from_user_id === meId;
            if (n.notification_type === 'game_challenge' && n.data?.game_id) {
              gameId = n.data.game_id;
              action = isOutgoingChallenge ? undefined : 'accept';
              notificationType = isOutgoingChallenge ? undefined : 'game_challenge';
              console.log('[NotificationBell] Game challenge notification:', { gameId, notificationType });
            } else if (n.notification_type === 'rematch_requested' || n.notification_type === 'rematch') {
              gameId = n.data?.original_game_id || n.data?.game_id;
              if (gameId) {
                action = 'accept';
                notificationType = 'rematch_requested'; // Normalize to rematch_requested for handlers
              }
            }
            const newNotif: Notification = {
              id: n.id,
              type: 'notification',
              text: n.message,
              title: n.title,
              read: n.read,
              gameId,
              action,
              notificationType
            };
            setItems((prev) => {
              // Avoid duplicates
              if (prev.some(item => item.id === newNotif.id)) {
                console.log('[NotificationBell] Duplicate notification ignored:', newNotif.id);
                return prev;
              }
              console.log('[NotificationBell] Adding new notification to list:', newNotif);
              return [newNotif, ...prev];
            });
            
            // Show toast for challenge rejection
            if (n.notification_type === 'challenge_rejected') {
              // Create a custom event to show toast
              window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: n.message, type: 'info' }
              }));
            }
          } else {
            console.log('[NotificationBell] Received non-notification WebSocket message:', data);
          }
        } catch (e) {
          console.error('[NotificationBell] WebSocket message parse error:', e, event.data);
        }
      };
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Log more details about the error
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          console.error('WebSocket closed unexpectedly. Check backend logs for authentication errors.');
        }
      };
      ws.onclose = (event) => {
        wsRef.current = null;
        // Attempt to reconnect after a delay if not a normal closure
        if (event.code !== 1000) {
          setTimeout(() => {
            if (meId && !wsRef.current) {
              try {
                const token = localStorage.getItem('token');
                const wsUrl = token 
                  ? makeWsUrl(`/ws/user/${meId}/?token=${encodeURIComponent(token)}`)
                  : makeWsUrl(`/ws/user/${meId}/`);
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;
                ws.onmessage = (event) => {
                  try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'notification' && data.notification) {
                      const n = data.notification;
                      const isOutgoingChallenge = n.notification_type === 'game_challenge'
                        && n.data?.from_user_id
                        && meId
                        && n.data.from_user_id === meId;
                      const newNotif: Notification = {
                        id: n.id,
                        type: 'notification',
                        text: n.message,
                        title: n.title,
                        read: n.read,
                        gameId: n.data?.game_id || n.data?.original_game_id,
                        action: (n.notification_type === 'game_challenge' || n.notification_type === 'rematch_requested') && !isOutgoingChallenge ? 'accept' : undefined,
                        notificationType: isOutgoingChallenge ? undefined : n.notification_type
                      };
                      setItems((prev) => {
                        if (prev.some(item => item.id === newNotif.id)) {
                          return prev;
                        }
                        return [newNotif, ...prev];
                      });
                      if (n.notification_type === 'challenge_rejected') {
                        window.dispatchEvent(new CustomEvent('show-toast', {
                          detail: { message: n.message, type: 'info' }
                        }));
                      }
                    }
                  } catch (e) {
                    console.error('WebSocket message parse error:', e);
                  }
                };
                ws.onerror = (error) => {
                  console.error('WebSocket error:', error);
                };
                ws.onclose = (event) => {
                  wsRef.current = null;
                };
              } catch (err) {
                console.error('Failed to reconnect WebSocket:', err);
              }
            }
          }, 3000);
        }
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
    }
    
    return () => {
      clearInterval(t);
      wsRef.current?.close();
    };
  }, [meId]);

  const handleAccept = (id?: number, notificationType?: string) => {
    if (!id) return;
    setIgnoredChallenges((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      persistIgnored(next, ignoredIds);
      return next;
    });
    
    // Determine if this is a rematch or challenge
    const isRematch = notificationType === 'rematch_requested';
    const acceptPromise = isRematch ? rematchAccept(id) : acceptChallenge(id);
    
    acceptPromise
      .then((data) => {
        console.log('[NotificationBell] Challenge accepted, response:', data);
        // Mark notification as read if it's from the API
        const notif = items.find(n => n.gameId === id && n.type === 'notification');
        if (notif && notif.id && !notif.id.startsWith('chal-') && !notif.id.startsWith('msg-')) {
          markNotificationRead(notif.id).catch(() => {});
        }
        setItems((prev) => prev.filter((n) => n.gameId !== id));
        setIgnoredIds((prev) => {
          const next = [...new Set([...prev, `chal-${id}`])];
          persistIgnored(ignoredChallenges, next);
          return next;
        });
        // Jump into the game on accept
        // For rematch, the response might contain the new game ID
        const gameId = data?.id || id;
        console.log('[NotificationBell] Redirecting to game:', gameId, 'game status:', data?.status);
        // Small delay to ensure backend has processed the start
        setTimeout(() => {
          setHashRoute(`/games/${gameId}`);
        }, 100);
      })
      .catch(() => {
        setItems((prev) => prev.filter((n) => n.gameId !== id));
        setIgnoredIds((prev) => {
          const next = [...new Set([...prev, `chal-${id}`])];
          persistIgnored(ignoredChallenges, next);
          return next;
        });
      });
  };
  const handleDelete = (notificationId: string, gameId?: number) => {
    // Remove from UI immediately
    setItems((prev) => prev.filter((n) => n.id !== notificationId));
    
    // Mark as read if it's an API notification
    if (notificationId && !notificationId.startsWith('chal-') && !notificationId.startsWith('msg-')) {
      markNotificationRead(notificationId).catch(() => {});
    }
    
    // Add to ignored list to prevent it from showing again
    setIgnoredIds((prev) => {
      const next = [...new Set([...prev, notificationId])];
      if (gameId) {
        next.push(`chal-${gameId}`);
      }
      persistIgnored(ignoredChallenges, next);
      return next;
    });
    
    // If it's a challenge/rematch notification, also add gameId to ignored challenges
    if (gameId) {
      setIgnoredChallenges((prev) => {
        const next = prev.includes(gameId) ? prev : [...prev, gameId];
        persistIgnored(next, ignoredIds);
        return next;
      });
    }
  };

  const handleReject = (id?: number, notificationType?: string) => {
    if (!id) return;
    
    // Immediately remove from UI to prevent duplicate clicks
    setItems((prev) => prev.filter((n) => n.gameId !== id && n.id !== `chal-${id}`));
    
    setIgnoredChallenges((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      persistIgnored(next, ignoredIds);
      return next;
    });
    
    // Find and mark all related notifications as read
    const relatedNotifs = items.filter(n => 
      (n.gameId === id || n.id === `chal-${id}`) && 
      n.type === 'notification' && 
      n.id && 
      !n.id.startsWith('chal-') && 
      !n.id.startsWith('msg-')
    );
    
    // Mark all related notifications as read
    relatedNotifs.forEach(notif => {
      if (notif.id) {
        markNotificationRead(notif.id).catch(() => {});
      }
    });
    
    // Add notification IDs to ignored list
    const notifIds = relatedNotifs.map(n => n.id).filter(Boolean) as string[];
    setIgnoredIds((prev) => {
      const next = [...new Set([...prev, ...notifIds, `chal-${id}`])];
      persistIgnored(ignoredChallenges, next);
      return next;
    });
    
    // Determine if this is a rematch or challenge
    const isRematch = notificationType === 'rematch_requested';
    const rejectPromise = isRematch ? rematchReject(id) : rejectChallenge(id);
    
    rejectPromise
      .then(() => {
        // Reload notifications to ensure UI is in sync
        if (meId) {
          setTimeout(() => load(), 500);
        }
      })
      .catch(() => {
        // Even on error, ensure notification is removed
        if (meId) {
          setTimeout(() => load(), 500);
        }
      });
  };

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle clicking outside to close dropdown and mark viewed notifications as read
  useEffect(() => {
    if (!open) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        // Mark all viewed notifications as read when closing dropdown
        const viewedIds = Array.from(viewedNotificationIds);
        if (viewedIds.length > 0) {
          const promises = viewedIds
            .filter(id => !id.startsWith('chal-') && !id.startsWith('msg-'))
            .map(id => markNotificationRead(id).catch(() => {}));
          Promise.all(promises).then(() => {
            setViewedNotificationIds(new Set());
            // Reload notifications to update read status
            if (meId) {
              // Call load function directly
              fetchNotifications()
                .then((response) => {
                  const apiNotifs: Notification[] = (response.notifications || [])
                    .filter((n: ApiNotification) => !n.read && !ignoredIds.includes(n.id))
                    .map((n: ApiNotification) => {
                      let gameId: number | undefined;
                      let action: 'accept' | undefined = undefined;
                      let notificationType: string | undefined = undefined;
                      const isOutgoingChallenge = n.notification_type === 'game_challenge'
                        && n.data?.from_user_id
                        && meId
                        && n.data.from_user_id === meId;
                      if (n.notification_type === 'game_challenge' && n.data?.game_id) {
                        gameId = n.data.game_id;
                        action = isOutgoingChallenge ? undefined : 'accept';
                        notificationType = isOutgoingChallenge ? undefined : 'game_challenge';
                      } else if (n.notification_type === 'rematch_requested' && (n.data?.game_id || n.data?.original_game_id)) {
                        gameId = n.data?.game_id || n.data?.original_game_id;
                        action = 'accept';
                        notificationType = 'rematch_requested';
                      }
                      return {
                        id: n.id,
                        type: 'notification' as const,
                        text: n.message,
                        title: n.title,
                        read: n.read,
                        gameId,
                        action,
                        notificationType
                      };
                    });
                  setItems(apiNotifs);
                })
                .catch(() => {});
            }
          });
        }
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, viewedNotificationIds, meId, ignoredIds]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          if (open && viewedNotificationIds.size > 0) {
            // Mark all viewed notifications as read when closing dropdown
            const promises = Array.from(viewedNotificationIds)
              .filter(id => !id.startsWith('chal-') && !id.startsWith('msg-'))
              .map(id => markNotificationRead(id).catch(() => {}));
            Promise.all(promises).then(() => {
              setViewedNotificationIds(new Set());
              // Reload notifications to update read status
              if (meId) load();
            });
          }
          setOpen((v) => !v);
        }}
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined">notifications</span>
        {items.length > 0 && <span className="notification-badge">{items.length}</span>}
      </button>
      {open && (
        <div className="dropdown">
          {items.length === 0 && <div className="dropdown-empty">No notifications.</div>}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                // Track that this notification was viewed
                if (!viewedNotificationIds.has(n.id)) {
                  setViewedNotificationIds(prev => new Set([...prev, n.id]));
                }
              }}
              className="dropdown-item"
            >
              {/* Delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(n.id, n.gameId);
                }}
                className="dropdown-delete"
                title="Delete notification"
              >
                ×
              </button>
              <div style={{ fontWeight: 600, paddingRight: 28 }}>{n.title || (n.type === 'message' ? 'Message' : n.type === 'challenge' ? 'Challenge' : 'Notification')}</div>
              <div style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.text}</div>
              {(() => {
                const isChallenge = n.type === 'challenge' && n.gameId;
                const isNotification = n.type === 'notification' && n.gameId && (n.action === 'accept' || n.notificationType === 'rematch_requested' || n.notificationType === 'rematch' || n.notificationType === 'game_challenge');
                const shouldShow = isChallenge || isNotification;
                
                if (n.type === 'notification' && (n.notificationType === 'rematch' || n.notificationType === 'rematch_requested')) {
                  console.log('[NotificationBell] Rendering rematch notification:', {
                    type: n.type,
                    notificationType: n.notificationType,
                    gameId: n.gameId,
                    action: n.action,
                    isChallenge,
                    isNotification,
                    shouldShow
                  });
                }
                
                return shouldShow ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-success btn-sm" type="button" onClick={(e) => { e.stopPropagation(); handleAccept(n.gameId, n.notificationType); }}>Accept</button>
                    <button className="btn btn-danger btn-sm" type="button" onClick={(e) => { e.stopPropagation(); handleReject(n.gameId, n.notificationType); }}>Reject</button>
                  </div>
                ) : null;
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
