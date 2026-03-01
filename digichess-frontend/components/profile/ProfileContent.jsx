'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, UserPlus, Mail, X } from 'lucide-react';
import {
  createThread,
  fetchPublicAccount,
  fetchRatingHistory,
  fetchUserGames,
  sendFriendRequest,
  updateProfile,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import CountrySelect from '@/components/common/CountrySelect';
import MiniChessBoard from '@/components/chess/MiniChessBoard';
import { getBlitzTag, getRatingTagClasses } from '@/utils/ratingTags';
import { flagFor } from '@/utils/countries';

const RATING_MODES = ['bullet', 'blitz', 'rapid', 'classical'];
const RATING_RANGES = [
  { id: 'week', label: 'This Week', days: 7 },
  { id: 'month', label: 'This Month', days: 30 },
  { id: 'year', label: 'This Year', days: 365 },
  { id: 'all', label: 'All Time', days: null },
];

function formatResult(game, username) {
  if (!game || !username) return '•';
  if (game.result === '1/2-1/2') return 'Draw';
  if (game.result === '1-0') return game.white?.username === username ? 'Win' : 'Loss';
  if (game.result === '0-1') return game.black?.username === username ? 'Win' : 'Loss';
  return 'In Progress';
}

function RatingChart({ history }) {
  if (!history || history.length < 2) return <div className="text-sm text-slate-500">Not enough data.</div>;
  const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
  const values = sorted.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coords = sorted.map((point, i) => {
    const x = (i / (sorted.length - 1)) * 100;
    const y = 100 - ((point.rating - min) / range) * 80 - 10;
    return { x, y };
  });
  const pathD = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <div className="relative h-52 w-full">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ratingGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(79, 209, 197, 0.5)" />
            <stop offset="100%" stopColor="rgba(79, 209, 197, 0.05)" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L 100 100 L 0 100 Z`} fill="url(#ratingGrad)" />
        <path d={pathD} fill="none" stroke="#4fd1c5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function ProfileContent({ username, isSelf }) {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [profileUser, setProfileUser] = useState(null);
  const [mode, setMode] = useState('blitz');
  const [timeRange, setTimeRange] = useState('all');
  const [history, setHistory] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [friendState, setFriendState] = useState('idle');
  const [friendError, setFriendError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editForm, setEditForm] = useState({ nickname: '', bio: '', country: '' });

  const displayUser = isSelf ? user : profileUser;
  const rangeParams = useMemo(() => {
    if (timeRange === 'all') return {};
    const range = RATING_RANGES.find((r) => r.id === timeRange);
    if (!range?.days) return {};
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - range.days);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }, [timeRange]);

  const stats = useMemo(() => [
    { label: 'Bullet', value: displayUser?.rating_bullet ?? 800 },
    { label: 'Blitz', value: displayUser?.rating_blitz ?? 800 },
    { label: 'Rapid', value: displayUser?.rating_rapid ?? 800 },
  ], [displayUser]);

  const currentRating = useMemo(() => (history.length ? history[history.length - 1].rating : displayUser?.[`rating_${mode}`] || 0), [history, mode, displayUser]);
  const peakRating = useMemo(() => (history.length ? Math.max(...history.map((p) => p.rating)) : currentRating), [history, currentRating]);
  const ratingDelta = useMemo(() => (history.length < 2 ? 0 : history[history.length - 1].rating - history[history.length - 2].rating), [history]);

  const completedGames = useMemo(() => recentGames.filter((g) => ['1-0', '0-1', '1/2-1/2'].includes(g.result)), [recentGames]);
  const visibleGames = isSelf ? completedGames : completedGames.filter((g) => !(g.white?.is_bot || g.black?.is_bot));
  const recentPreview = visibleGames.slice(0, 5);

  const canFriend = !isSelf && displayUser && !displayUser.is_bot;
  const canMessage = !isSelf && displayUser && !displayUser.is_bot;
  const liveGameId = displayUser?.spectate_game_id || null;
  const isPlayingLive = Boolean(displayUser?.is_playing || liveGameId);

  useEffect(() => {
    if (!username || isSelf) {
      setProfileUser(null);
      return;
    }
    let active = true;
    fetchPublicAccount(username).then((d) => { if (active) setProfileUser(d); }).catch(() => { if (active) setProfileUser(null); });
    return () => { active = false; };
  }, [username, isSelf]);

  useEffect(() => {
    if (!displayUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchRatingHistory(displayUser.username, mode, rangeParams),
      fetchUserGames(displayUser.username, { page_size: 50 }),
    ])
      .then(([histRes, gamesRes]) => {
        setHistory(histRes?.history ?? []);
        setRecentGames(gamesRes?.results ?? []);
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, [displayUser, mode, rangeParams]);

  useEffect(() => {
    if (isSelf && displayUser) {
      setEditForm({ nickname: displayUser.nickname || '', bio: displayUser.bio || '', country: displayUser.country || '' });
    }
  }, [isSelf, displayUser]);

  const handleFriendRequest = async () => {
    if (!displayUser?.id || friendState === 'loading' || friendState === 'sent') return;
    setFriendError(null);
    setFriendState('loading');
    try {
      await sendFriendRequest(Number(displayUser.id));
      setFriendState('sent');
    } catch (err) {
      setFriendState('idle');
      setFriendError(err?.message || 'Could not send request.');
    }
  };

  const handleMessage = async () => {
    if (!displayUser?.id) return;
    try {
      const thread = await createThread(displayUser.id);
      if (thread?.id) router.push(`/messages?thread=${thread.id}`);
    } catch (err) {
      setFriendError(err?.message || 'Could not start chat.');
    }
  };

  const handleEditSave = async () => {
    setEditError(null);
    setEditLoading(true);
    try {
      const updated = await updateProfile({ nickname: editForm.nickname || '', bio: editForm.bio || '', country: editForm.country || '' });
      setUser(updated);
      setEditOpen(false);
    } catch (err) {
      setEditError(err?.message || 'Could not update profile.');
    } finally {
      setEditLoading(false);
    }
  };

  if (!displayUser && (isSelf ? !user : !username)) {
    return <div className="py-8 text-center text-slate-500">Loading...</div>;
  }

  if (!isSelf && !displayUser) {
    return <div className="py-8 text-center text-slate-500">User not found.</div>;
  }

  const blitzTag = displayUser?.is_bot ? null : getBlitzTag(displayUser?.rating_blitz);
  const blitzTagClasses = blitzTag ? getRatingTagClasses(blitzTag) : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-xl overflow-hidden shadow-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xl font-bold">
            {(displayUser?.profile_pic || displayUser?.avatar) ? (
              <img src={displayUser.profile_pic || displayUser.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              displayUser?.username?.slice(0, 2).toUpperCase()
            )}
          </div>
          {isSelf && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background-light dark:border-background-dark" />}
        </div>
        <div className="flex items-center justify-center gap-2">
          {blitzTag && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${blitzTagClasses}`}>{blitzTag}</span>}
          <h1 className="text-2xl font-bold">{displayUser?.username}</h1>
          <span>{displayUser?.country ? flagFor(displayUser.country) : '🌍'}</span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{displayUser?.bio || 'No bio yet.'}</p>

        <div className="grid grid-cols-3 gap-4 w-full max-w-sm mt-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800">
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {isSelf ? (
          <button type="button" className="mt-4 px-4 py-2 rounded-lg bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 font-semibold text-sm" onClick={() => setEditOpen(true)}>
            Edit profile
          </button>
        ) : (
          <div className="flex flex-col gap-2 w-full max-w-sm mt-4">
            <div className="flex gap-3">
              {canFriend && (
                <button type="button" className="flex-1 py-2.5 px-4 rounded-lg bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2" onClick={handleFriendRequest} disabled={friendState === 'loading' || friendState === 'sent'}>
                  {friendState === 'sent' ? <Check className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  {friendState === 'sent' ? 'Request sent' : 'Add friend'}
                </button>
              )}
              {canMessage && (
                <button type="button" className="flex-1 py-2.5 px-4 rounded-lg bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2" onClick={handleMessage}>
                  <Mail className="w-5 h-5" />
                  Message
                </button>
              )}
            </div>
            {isPlayingLive && liveGameId && (
              <button type="button" className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm" onClick={() => router.push(`/game/${liveGameId}`)}>
                View live game
              </button>
            )}
            {friendError && <p className="text-xs text-red-500">{friendError}</p>}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-bold mb-2">Performance</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {RATING_MODES.map((m) => (
            <button key={m} type="button" className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === m ? 'bg-primary text-white' : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-500'}`} onClick={() => setMode(m)}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {RATING_RANGES.map((r) => (
            <button key={r.id} type="button" className={`px-3 py-1.5 rounded-full text-xs font-semibold ${timeRange === r.id ? 'bg-primary text-white' : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-500'}`} onClick={() => setTimeRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm text-slate-500">Current</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{currentRating || '--'}</span>
                <span className={`text-sm font-bold ${ratingDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {ratingDelta >= 0 ? `+${ratingDelta}` : ratingDelta}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Peak</p>
              <p className="text-lg font-bold">{peakRating || '--'}</p>
            </div>
          </div>
          {loading ? <p className="text-sm text-slate-500">Loading...</p> : error ? <p className="text-sm text-red-500">{error}</p> : <RatingChart history={history} />}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-3">Recent games</h3>
        <div className="space-y-2">
          {recentPreview.map((game) => {
            const opponent = game.white?.username === displayUser?.username ? game.black : game.white;
            const outcome = formatResult(game, displayUser?.username);
            return (
              <button key={game.id} type="button" className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => router.push(`/game/${game.id}`)}>
                <div className={`w-1.5 h-10 rounded-full ${outcome === 'Win' ? 'bg-green-500' : outcome === 'Loss' ? 'bg-red-500' : 'bg-slate-400'}`} />
                <MiniChessBoard fen={game.current_fen} size={48} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">vs {opponent?.username || 'Opponent'}</p>
                  <p className="text-xs text-slate-500">{game.time_control} • {outcome}</p>
                </div>
                <span className="text-xs text-slate-400">{new Date(game.created_at).toLocaleDateString()}</span>
              </button>
            );
          })}
        </div>
        {!recentPreview.length && !loading && <p className="text-sm text-slate-500">No games yet.</p>}
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-bold">Edit profile</h3>
              <button type="button" className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => setEditOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">Nickname</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value={editForm.nickname} onChange={(e) => setEditForm((p) => ({ ...p, nickname: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">Bio</span>
                <textarea className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[80px]" value={editForm.bio} onChange={(e) => setEditForm((p) => ({ ...p, bio: e.target.value }))} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">Country</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-lg">{flagFor(editForm.country)}</span>
                  <CountrySelect value={editForm.country} onChange={(v) => setEditForm((p) => ({ ...p, country: v }))} />
                </div>
              </label>
              {editError && <p className="text-xs text-red-500">{editError}</p>}
              <button type="button" className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60" onClick={handleEditSave} disabled={editLoading}>
                {editLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
