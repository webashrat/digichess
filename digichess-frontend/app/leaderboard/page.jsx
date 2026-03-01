'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchDigiQuizLeaderboard,
  fetchLeaderboard,
} from '@/lib/api';
import useNotifications from '@/hooks/useNotifications';
import Podium from '@/components/leaderboard/Podium';
import PlayerList from '@/components/leaderboard/PlayerList';

const MODE_LABELS = { classical: 'Standard', blitz: 'Blitz', bullet: 'Bullet', rapid: 'Rapid', digiquiz: 'DigiQuiz' };
const MODES = ['classical', 'blitz', 'bullet', 'rapid', 'digiquiz'];

export default function LeaderboardPage() {
  const [mode, setMode] = useState('blitz');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useNotifications({ pageSize: 10 });

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = mode === 'digiquiz'
        ? await fetchDigiQuizLeaderboard(1, 50)
        : await fetchLeaderboard(mode, 1, 50);
      const results = data?.results ?? [];
      const mapped = results.map((p) => ({
        id: p.id,
        username: p.username,
        rating: mode === 'digiquiz' ? p.rating_digiquiz : p.rating,
        rating_blitz: p.rating_blitz,
        avatar: p.profile_pic || '',
        is_bot: p.is_bot,
        isSelf: false,
      }));
      setPlayers(mapped);
    } catch (err) {
      setError(err?.message || 'Failed to load leaderboard.');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const podiumPlayers = players.slice(0, 3);
  const listPlayers = players.slice(3);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Leaderboard</h1>

      <div className="flex flex-nowrap gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 ${mode === m ? 'bg-primary text-white' : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
            onClick={() => setMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {loading && <p className="text-sm text-slate-500">Updating leaderboard...</p>}
      {error && (
        <div className="flex items-center gap-2">
          <span className="text-red-500">{error}</span>
          <button type="button" className="text-sm text-primary underline" onClick={loadLeaderboard}>Retry</button>
        </div>
      )}
      {!loading && !error && (
        <>
          <Podium players={podiumPlayers} />
          <PlayerList players={listPlayers} startRank={4} />
        </>
      )}
    </div>
  );
}
