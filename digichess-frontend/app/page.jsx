'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Swords, PlusCircle, X, Flame, Zap, Timer, Hourglass } from 'lucide-react';
import {
  acceptGame,
  acceptRematch,
  cancelMatchmaking,
  createGame,
  enqueueMatchmaking,
  fetchPublicAccount,
  fetchPublicGames,
  rejectGame,
  rejectRematch,
  respondFriendRequest,
  searchPublicUsers,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import useNotifications from '@/hooks/useNotifications';
import MiniChessBoard from '@/components/chess/MiniChessBoard';
import { getBlitzTag } from '@/utils/ratingTags';

const QUICK_PLAY_CARDS = [
  { id: 'bullet', label: 'Bullet', time: '1+0', Icon: Flame, color: 'text-orange-400' },
  { id: 'blitz', label: 'Blitz', time: '3+2', Icon: Zap, color: 'text-yellow-400' },
  { id: 'rapid', label: 'Rapid', time: '10+0', Icon: Timer, color: 'text-green-400' },
  { id: 'classical', label: 'Classical', time: '30+0', Icon: Hourglass, color: 'text-blue-400' },
];

const CUSTOM_FORMAT_OPTIONS = [
  { id: 'bullet', label: 'Bullet' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'rapid', label: 'Rapid' },
  { id: 'classical', label: 'Classical' },
  { id: 'custom', label: 'Custom' },
];

const FORMAT_PRESETS = {
  bullet: { minutes: 1, increment: 0 },
  blitz: { minutes: 3, increment: 2 },
  rapid: { minutes: 10, increment: 0 },
  classical: { minutes: 30, increment: 0 },
};

function getRatingForControl(user, control) {
  if (!user) return null;
  const map = { bullet: user.rating_bullet, blitz: user.rating_blitz, rapid: user.rating_rapid, classical: user.rating_classical };
  return map[control] || null;
}

function getEvalSplit(game) {
  if (typeof game?.evaluation === 'number') {
    const clamped = Math.max(-10, Math.min(10, game.evaluation));
    const white = Math.round(50 + (clamped / 20) * 100);
    return { white: Math.max(0, Math.min(100, white)), black: Math.max(0, 100 - white) };
  }
  return { white: 50, black: 50 };
}

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [queueingControl, setQueueingControl] = useState(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [liveGames, setLiveGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playModalOpen, setPlayModalOpen] = useState(false);
  const [boardThemeIndex, setBoardThemeIndex] = useState(6);
  const [pieceSet, setPieceSet] = useState('cburnett');
  const [activeGameId, setActiveGameId] = useState(null);

  const [customOpponentQuery, setCustomOpponentQuery] = useState('');
  const [customOpponent, setCustomOpponent] = useState(null);
  const [customSearchLoading, setCustomSearchLoading] = useState(false);
  const [customSearchResults, setCustomSearchResults] = useState([]);
  const [customFormat, setCustomFormat] = useState('blitz');
  const [customMinutes, setCustomMinutes] = useState(3);
  const [customIncrement, setCustomIncrement] = useState(2);
  const [customRated, setCustomRated] = useState(true);
  const [customColor, setCustomColor] = useState('auto');
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState(null);

  useNotifications({
    pageSize: 10,
    onMatchFound: (gameId) => {
      if (!queueingControl) return;
      setQueueingControl(null);
      setQueueLoading(false);
      if (gameId) router.push(`/game/${gameId}`);
    },
  });

  const stats = useMemo(() => [
    { label: 'Bullet', value: user?.rating_bullet || 800, Icon: Flame, color: 'text-orange-400' },
    { label: 'Blitz', value: user?.rating_blitz || 800, Icon: Zap, color: 'text-yellow-400' },
    { label: 'Rapid', value: user?.rating_rapid || 800, Icon: Timer, color: 'text-green-400' },
  ], [user]);

  const blitzTag = getBlitzTag(user?.rating_blitz);

  const loadLiveGames = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const gamesRes = await fetchPublicGames({ status: 'active', page_size: 6 });
      setLiveGames(gamesRes?.results || []);
      setError(null);
    } catch (err) {
      if (showSpinner) setError('Failed to load dashboard data.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveGames(true);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadLiveGames(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadLiveGames]);

  useEffect(() => {
    if (!user?.username) {
      setActiveGameId(null);
      return;
    }
    fetchPublicAccount(user.username)
      .then((data) => {
        if (data?.is_playing && data?.spectate_game_id) setActiveGameId(data.spectate_game_id);
        else setActiveGameId(null);
      })
      .catch(() => setActiveGameId(null));
  }, [user?.username]);

  useEffect(() => {
    if (!playModalOpen) return;
    const query = customOpponentQuery.trim();
    if (customOpponent && query && customOpponent.username?.toLowerCase() !== query.toLowerCase()) setCustomOpponent(null);
    if (!query || query.length < 2) {
      setCustomSearchResults([]);
      setCustomSearchLoading(false);
      return;
    }
    let active = true;
    setCustomSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await searchPublicUsers(query, { page_size: 6, sort: 'username' });
        if (!active) return;
        setCustomSearchResults((data?.results || []).filter((item) => item.id !== user?.id));
      } catch (_err) {
        if (active) setCustomSearchResults([]);
      } finally {
        if (active) setCustomSearchLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [customOpponentQuery, customOpponent, playModalOpen, user?.id]);

  useEffect(() => {
    if (customFormat === 'custom') {
      setCustomRated(false);
      return;
    }
    const preset = FORMAT_PRESETS[customFormat];
    if (preset) {
      setCustomMinutes(preset.minutes);
      setCustomIncrement(preset.increment);
    }
  }, [customFormat]);

  const handleQuickPlay = async (timeControl) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (queueingControl) return;
    setQueueLoading(true);
    setQueueError(null);
    try {
      const result = await enqueueMatchmaking(timeControl);
      if (result?.id) {
        router.push(`/game/${result.id}`);
        return;
      }
      setQueueingControl(timeControl);
    } catch (err) {
      setQueueError(err.message || 'Failed to join queue.');
    } finally {
      setQueueLoading(false);
    }
  };

  const handleCancelQueue = async () => {
    if (!queueingControl) return;
    try {
      await cancelMatchmaking(queueingControl);
    } catch (_err) { }
    finally {
      setQueueingControl(null);
    }
  };

  const handleCreateCustomGame = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!customOpponent?.id) {
      setCustomError('Select an opponent first.');
      return;
    }
    const minutes = Number(customMinutes);
    const increment = Number(customIncrement);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setCustomError('Initial time must be greater than 0.');
      return;
    }
    if (!Number.isFinite(increment) || increment < 0 || increment > 60) {
      setCustomError('Increment must be between 0 and 60 seconds.');
      return;
    }
    const initialSeconds = Math.round(minutes * 60);
    if (initialSeconds < 1 || initialSeconds > 7200) {
      setCustomError('Initial time must be between 1 and 120 minutes.');
      return;
    }
    setCustomSubmitting(true);
    setCustomError(null);
    try {
      const payload = {
        opponent_id: customOpponent.id,
        time_control: customFormat,
        preferred_color: customColor,
        rated: customFormat === 'custom' ? false : customRated,
      };
      if (customFormat === 'custom') {
        payload.white_time_seconds = initialSeconds;
        payload.black_time_seconds = initialSeconds;
        payload.white_increment_seconds = increment;
        payload.black_increment_seconds = increment;
      } else {
        payload.initial_time_seconds = initialSeconds;
        payload.increment_seconds = increment;
      }
      const game = await createGame(payload);
      if (game?.id) {
        setPlayModalOpen(false);
        router.push(`/game/${game.id}`);
      }
    } catch (err) {
      setCustomError(err.message || 'Failed to create game.');
    } finally {
      setCustomSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {activeGameId && (
        <button
          type="button"
          className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 w-full text-left hover:bg-red-500/15"
          onClick={() => router.push(`/game/${activeGameId}`)}
        >
          <div>
            <p className="text-sm font-semibold text-red-500">Game in progress</p>
            <p className="text-xs text-slate-500">Resume your live game now.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-red-500" />
        </button>
      )}

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => {
          const StatIcon = stat.Icon;
          return (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-xl bg-surface-dark border border-gray-800 p-3 items-center text-center shadow-sm"
            >
              <StatIcon className={`w-5 h-5 ${stat.color}`} />
              <p className="text-white text-lg font-bold leading-tight">{stat.value}</p>
              <p className="text-gray-400 text-xs font-normal">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <section>
        <div className="flex items-center gap-2 sm:gap-3 mb-8 mt-16 flex-wrap">
          <h2 className="text-base sm:text-xl font-bold flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
            <Swords className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Play Chess
          </h2>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setPlayModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 sm:py-2.5 sm:px-5 rounded-xl bg-gradient-to-r from-primary/80 to-blue-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all whitespace-nowrap"
              type="button"
            >
              <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              Play Chess
            </button>
            <Link
              href="/play"
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 sm:py-2.5 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-600/80 to-teal-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all whitespace-nowrap"
            >
              🤖 Play Bot
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_PLAY_CARDS.map((card) => {
            const CardIcon = card.Icon;
            return (
              <button
                key={card.id}
                onClick={() => handleQuickPlay(card.id)}
                disabled={queueLoading || Boolean(queueingControl)}
                className="group relative flex flex-col items-start justify-between p-4 h-28 sm:h-32 rounded-2xl bg-gradient-to-br from-[#1e232e] to-[#13161c] border border-gray-800 hover:border-primary/50 transition-all overflow-hidden disabled:opacity-60"
                type="button"
              >
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20">
                  <CardIcon className="w-14 h-14" />
                </div>
                <div className="bg-gray-800/50 p-2 rounded-lg backdrop-blur-sm">
                  <CardIcon className={`w-6 h-6 ${card.color}`} />
                </div>
                <div>
                  <span className="block text-2xl font-bold text-white">{card.time}</span>
                  <span className="text-sm text-gray-400 font-medium">{card.label}</span>
                </div>
              </button>
            );
          })}
        </div>
        {(queueingControl || queueError) && (
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            {queueingControl && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="text-xs text-slate-600 dark:text-slate-300">Searching for {queueingControl}...</span>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold"
                  onClick={handleCancelQueue}
                >
                  Cancel
                </button>
              </div>
            )}
            {queueError && <span className="text-xs text-red-500">{queueError}</span>}
          </div>
        )}
      </section>

      <section className="border-t border-gray-800 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            Live Games
          </h2>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Loading live games...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveGames.slice(0, 6).map((game) => {
              const evalSplit = getEvalSplit(game);
              const isUserInGame = user && (game.white?.id === user.id || game.black?.id === user.id);
              const actionLabel = isUserInGame ? 'Play' : 'Watch';
              return (
                <button
                  key={game.id}
                  className="bg-surface-dark border border-gray-800 rounded-xl overflow-hidden shadow-lg text-left hover:border-primary/30 transition-colors"
                  type="button"
                  onClick={() => router.push(`/game/${game.id}`)}
                >
                  <div className="relative aspect-square w-full bg-gray-800 flex items-center justify-center">
                    <MiniChessBoard
                      fen={game.current_fen}
                      size={200}
                      themeIndex={boardThemeIndex}
                      pieceSet={pieceSet}
                    />
                    <div className="absolute left-0 top-0 bottom-0 w-2 bg-gray-700 flex flex-col">
                      <div className="bg-white w-full" style={{ height: `${evalSplit.white}%` }} />
                      <div className="bg-black w-full" style={{ height: `${evalSplit.black}%` }} />
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-white" />
                        <span className="text-sm font-bold truncate max-w-[80px]">{game.white?.username || 'White'}</span>
                      </div>
                      <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">
                        {getRatingForControl(game.white, game.time_control) || '--'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-black border border-gray-600" />
                        <span className="text-sm font-bold truncate max-w-[80px]">{game.black?.username || 'Black'}</span>
                      </div>
                      <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">
                        {getRatingForControl(game.black, game.time_control) || '--'}
                      </span>
                    </div>
                    <div className="flex justify-end mt-3">
                      <span className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold">{actionLabel}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {!liveGames.length && !loading && <p className="text-sm text-slate-500">No live games yet.</p>}
      </section>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Play Chess modal (custom game form) */}
      {playModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Create custom game</h3>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
                onClick={() => setPlayModalOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500">Opponent</label>
                <input
                  value={customOpponentQuery}
                  onChange={(e) => setCustomOpponentQuery(e.target.value)}
                  placeholder="Search username"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {customOpponentQuery.trim().length >= 2 && (
                  <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 max-h-40 overflow-y-auto">
                    {customSearchLoading ? (
                      <div className="px-3 py-2 text-xs text-slate-500">Searching...</div>
                    ) : customSearchResults.length ? (
                      customSearchResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between"
                          onClick={() => {
                            setCustomOpponent(result);
                            setCustomOpponentQuery(result.username || '');
                            setCustomSearchResults([]);
                          }}
                        >
                          <span className="font-semibold">{result.username}</span>
                          <span className="text-xs text-slate-400">{result.rating_blitz ?? '--'}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No users found.</div>
                    )}
                  </div>
                )}
                {customOpponent && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selected: {customOpponent.username}
                    <button type="button" className="ml-2 text-primary hover:underline" onClick={() => { setCustomOpponent(null); setCustomOpponentQuery(''); }}>
                      Clear
                    </button>
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Color</label>
                <select
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="auto">Random</option>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Format</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CUSTOM_FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCustomFormat(opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${customFormat === opt.id ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 dark:border-slate-700'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500">Minutes</label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Increment (s)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={customIncrement}
                    onChange={(e) => setCustomIncrement(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {customFormat !== 'custom' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={customRated}
                    onChange={(e) => setCustomRated(e.target.checked)}
                    className="rounded border-slate-300 text-primary"
                  />
                  Rated
                </label>
              )}
              {customError && <p className="text-xs text-red-500">{customError}</p>}
              <button
                type="button"
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
                onClick={handleCreateCustomGame}
                disabled={customSubmitting}
              >
                {customSubmitting ? 'Creating...' : 'Send challenge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
