'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Swords } from 'lucide-react';
import {
  cancelMatchmaking,
  createBotGame,
  createGame,
  enqueueMatchmaking,
  fetchPublicAccount,
  listBots,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import useNotifications from '@/hooks/useNotifications';

const QUEUE_OPTIONS = [
  { id: 'bullet', label: 'Bullet', time: '1+0' },
  { id: 'blitz', label: 'Blitz', time: '3+0' },
  { id: 'rapid', label: 'Rapid', time: '10+0' },
  { id: 'classical', label: 'Classical', time: '30+0' },
];

function PlayPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const [playError, setPlayError] = useState(null);
  const [queueingControl, setQueueingControl] = useState(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [bots, setBots] = useState([]);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState(null);
  const [botMode, setBotMode] = useState('blitz');
  const [activeGameId, setActiveGameId] = useState(null);
  const opponentId = searchParams.get('opponent');
  const opponentName = searchParams.get('username') || 'Opponent';

  useEffect(() => {
    const loadBots = async () => {
      setBotLoading(true);
      setBotError(null);
      try {
        const data = await listBots(botMode);
        setBots(data.bots || []);
      } catch (_err) {
        setBotError('Failed to load bots.');
      } finally {
        setBotLoading(false);
      }
    };
    loadBots();
  }, [botMode]);

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

  useNotifications({
    onMatchFound: (gameId) => {
      if (!queueingControl) return;
      setQueueingControl(null);
      setQueueLoading(false);
      if (gameId) router.push(`/game/${gameId}`);
    },
  });

  const requireAuth = () => {
    if (!isAuthenticated) {
      router.push('/login');
      return false;
    }
    return true;
  };

  const handleQueueGame = async (timeControl) => {
    if (!requireAuth()) return;
    if (queueingControl) return;
    setPlayError(null);
    setQueueLoading(true);
    try {
      const result = await enqueueMatchmaking(timeControl);
      if (result?.id) {
        router.push(`/game/${result.id}`);
        return;
      }
      setQueueingControl(timeControl);
    } catch (err) {
      setPlayError(err.message || 'Failed to join queue.');
    } finally {
      setQueueLoading(false);
    }
  };

  const handleChallengeGame = async (timeControl) => {
    if (!requireAuth() || !opponentId) return;
    setPlayError(null);
    try {
      const game = await createGame({
        opponent_id: Number(opponentId),
        time_control: timeControl,
        rated: true,
        preferred_color: 'auto',
      });
      if (game?.id) router.push(`/game/${game.id}`);
    } catch (err) {
      setPlayError(err.message || 'Failed to send challenge.');
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

  const handleCreateBotGame = async (botId) => {
    if (!requireAuth()) return;
    setBotError(null);
    try {
      const game = await createBotGame(botId, { time_control: botMode, preferred_color: 'auto' });
      router.push(`/game/${game.id}`);
    } catch (err) {
      setBotError(err.message || 'Failed to create bot game.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Play</h1>

      {activeGameId && (
        <button
          type="button"
          className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between w-full text-left hover:bg-red-500/15"
          onClick={() => router.push(`/game/${activeGameId}`)}
        >
          <div>
            <p className="text-sm font-semibold text-red-500">Game in progress</p>
            <p className="text-xs text-slate-500">Resume your live game now.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-red-500" />
        </button>
      )}

      {opponentId && (
        <section className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-4">
          <h2 className="text-lg font-bold mb-1">Challenge {opponentName}</h2>
          <p className="text-xs text-slate-500 mb-3">Select a time control to send a challenge.</p>
          <div className="grid grid-cols-2 gap-3">
            {QUEUE_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => handleChallengeGame(option.id)}
                className="flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-[#1e232e] border border-slate-200 dark:border-gray-800 hover:border-primary"
                type="button"
              >
                <Swords className="w-8 h-8 text-primary mb-2" />
                <span className="text-lg font-bold">{option.time}</span>
                <span className="text-xs text-slate-500">{option.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-4">
        <h2 className="text-lg font-bold mb-3">Quick Play</h2>
        <div className="grid grid-cols-2 gap-3">
          {QUEUE_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => handleQueueGame(option.id)}
              disabled={queueLoading || Boolean(queueingControl)}
              className="flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-[#1e232e] border border-slate-200 dark:border-gray-800 hover:border-primary disabled:opacity-60"
              type="button"
            >
              <Swords className="w-8 h-8 text-primary mb-2" />
              <span className="text-lg font-bold">{option.time}</span>
              <span className="text-xs text-slate-500">{option.label}</span>
            </button>
          ))}
        </div>
        {queueingControl && (
          <div className="mt-3 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-300">Searching for {queueingControl}...</span>
            <button type="button" className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold" onClick={handleCancelQueue}>
              Cancel
            </button>
          </div>
        )}
        {playError && <p className="mt-3 text-sm text-red-500">{playError}</p>}
      </section>

      <section className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Play vs Bot</h2>
          <select
            value={botMode}
            onChange={(e) => setBotMode(e.target.value)}
            className="text-xs bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-gray-700 rounded-lg px-2 py-1"
          >
            {QUEUE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
        {botLoading ? (
          <p className="text-sm text-slate-500">Loading bots...</p>
        ) : (
          <div className="grid gap-3">
            {bots.map((bot) => (
              <div key={bot.id} className="flex items-center justify-between bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-gray-700 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg">
                    {bot.bot_avatar || '🤖'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{bot.first_name || bot.username}</p>
                    <p className="text-xs text-slate-500">Rating {bot.rating}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="bg-primary text-white text-xs font-semibold px-3 py-2 rounded-lg"
                  onClick={() => handleCreateBotGame(bot.id)}
                >
                  Play
                </button>
              </div>
            ))}
          </div>
        )}
        {!bots.length && !botLoading && <p className="text-sm text-slate-500">No bots available.</p>}
        {botError && <p className="mt-2 text-sm text-red-500">{botError}</p>}
      </section>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading...</div>}>
      <PlayPageContent />
    </Suspense>
  );
}
