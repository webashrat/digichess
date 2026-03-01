'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, UserPlus, Mail } from 'lucide-react';
import { createThread, getFriendRequests, sendFriendRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getBlitzTag, getRatingTagClasses } from '@/utils/ratingTags';

function PlayerRow({ player, rank, sentRequestUserIds }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  // Determine initial friend state from pre-fetched sent requests
  const initialState = sentRequestUserIds.has(player.id) ? 'already_sent' : 'idle';
  const [friendState, setFriendState] = useState(initialState);
  const [friendError, setFriendError] = useState(null);
  const [messageError, setMessageError] = useState(null);
  const isSelf = user?.id && player.id === user.id;
  const blitzRating = player.rating_blitz ?? player.blitz_rating ?? player.rating;
  const tag = player.is_bot ? null : getBlitzTag(blitzRating);
  const tagClasses = tag ? getRatingTagClasses(tag) : '';

  // Sync if sentRequestUserIds changes (e.g. after initial load)
  useEffect(() => {
    if (sentRequestUserIds.has(player.id) && friendState === 'idle') {
      setFriendState('already_sent');
    }
  }, [sentRequestUserIds, player.id, friendState]);

  const handleMessage = async (e) => {
    e.stopPropagation();
    if (isSelf || player.is_bot) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setMessageError(null);
    try {
      const thread = await createThread(player.id);
      if (thread?.id) router.push(`/messages?thread=${thread.id}`);
    } catch (err) {
      setMessageError(err?.message || 'Could not create chat');
    }
  };

  const handleFriendRequest = async (e) => {
    e.stopPropagation();
    if (isSelf || player.is_bot || friendState === 'sent' || friendState === 'already_sent' || friendState === 'loading') return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setFriendError(null);
    setFriendState('loading');
    try {
      const userId = Number(player.id);
      if (!Number.isFinite(userId)) {
        setFriendError('Invalid user');
        setFriendState('idle');
        return;
      }
      await sendFriendRequest(userId);
      setFriendState('sent');
    } catch (err) {
      const msg = err?.message || 'Could not send request';
      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes('already') || lowerMsg.includes('pending') || lowerMsg.includes('exists')) {
        setFriendState('already_sent');
        setFriendError('Request already sent');
      } else {
        setFriendState('idle');
        setFriendError(msg);
      }
    }
  };

  const getFriendIcon = () => {
    switch (friendState) {
      case 'sent':
        return <Check className="w-5 h-5" />;
      case 'already_sent':
        return <Clock className="w-5 h-5" />;
      default:
        return <UserPlus className="w-5 h-5" />;
    }
  };

  const getFriendTitle = () => {
    switch (friendState) {
      case 'sent':
        return 'Request sent';
      case 'already_sent':
        return 'Request pending';
      default:
        return 'Add friend';
    }
  };

  const getFriendBtnClass = () => {
    switch (friendState) {
      case 'sent':
        return 'text-green-500 bg-green-500/10';
      case 'already_sent':
        return 'text-amber-500 bg-amber-500/10';
      default:
        return 'text-slate-400 hover:text-primary hover:bg-primary/10';
    }
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${player.isSelf ? 'bg-primary/5 dark:bg-primary/10 border-l-2 border-l-primary' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => player.username && router.push(`/profile/${player.username}`)}
      onKeyDown={(e) => e.key === 'Enter' && player.username && router.push(`/profile/${player.username}`)}
    >
      <div className="text-xs sm:text-sm font-bold text-slate-500 w-5 sm:w-6 text-center shrink-0">{rank}</div>
      <div
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-700 bg-cover bg-center flex items-center justify-center text-[10px] font-bold text-white shrink-0"
        style={player.avatar ? { backgroundImage: `url('${player.avatar}')` } : undefined}
      >
        {!player.avatar ? (player.username?.slice(0, 2) || '??').toUpperCase() : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {tag && <span className={`text-[10px] px-1 py-0.5 rounded font-bold ${tagClasses} hidden sm:inline`}>{tag}</span>}
          <span className="truncate font-medium text-xs sm:text-sm">{player.username}</span>
        </div>
        {friendError && <span className="text-[10px] text-red-500">{friendError}</span>}
        {messageError && <span className="text-[10px] text-red-500">{messageError}</span>}
      </div>
      <div className="font-bold text-slate-700 dark:text-slate-300 text-xs sm:text-sm shrink-0">{player.rating}</div>
      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {!isSelf && !player.is_bot && (
          <>
            <button
              type="button"
              className={`p-1 sm:p-1.5 rounded-lg transition-colors ${getFriendBtnClass()}`}
              onClick={handleFriendRequest}
              disabled={friendState === 'loading' || friendState === 'sent' || friendState === 'already_sent'}
              title={getFriendTitle()}
            >
              {React.cloneElement(getFriendIcon(), { className: 'w-4 h-4' })}
            </button>
            <button
              type="button"
              className="p-1 sm:p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10"
              onClick={handleMessage}
              title="Message"
            >
              <Mail className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlayerList({ players = [], startRank = 4 }) {
  const { isAuthenticated } = useAuth();
  const [sentRequestUserIds, setSentRequestUserIds] = useState(new Set());

  // Fetch existing sent friend requests to persist icon state across refreshes
  useEffect(() => {
    if (!isAuthenticated) return;
    getFriendRequests()
      .then((data) => {
        const results = data?.results ?? (Array.isArray(data) ? data : []);
        const ids = new Set();
        results.forEach((req) => {
          // Sent requests: the to_user is the recipient
          if (req.to_user_id) ids.add(req.to_user_id);
          if (req.to_user?.id) ids.add(req.to_user.id);
        });
        setSentRequestUserIds(ids);
      })
      .catch(() => { /* silently ignore */ });
  }, [isAuthenticated]);

  if (!players?.length) return null;

  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-medium text-slate-500 uppercase">
        <div className="w-5 sm:w-6 text-center shrink-0">#</div>
        <div className="w-7 sm:w-8 shrink-0" />
        <div className="flex-1">Player</div>
        <div className="shrink-0">Rating</div>
        <div className="w-16 sm:w-20 shrink-0" />
      </div>
      {players.map((player, index) => (
        <PlayerRow key={player.id || index} player={player} rank={startRank + index} sentRequestUserIds={sentRequestUserIds} />
      ))}
    </div>
  );
}
