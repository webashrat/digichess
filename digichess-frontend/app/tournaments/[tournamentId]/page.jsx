'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTournament, registerTournament, tournamentStandings, tournamentMyGame } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params?.tournamentId;
  const { isAuthenticated } = useAuth();
  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getTournament(tournamentId),
      tournamentStandings(tournamentId),
    ])
      .then(([tourney, standingsRes]) => {
        setTournament(tourney);
        setStandings(standingsRes?.standings || []);
        if (isAuthenticated) {
          return tournamentMyGame(tournamentId).then((myGame) => {
            setIsRegistered(myGame?.is_registered ?? false);
          });
        }
      })
      .catch(() => setError('Failed to load tournament.'))
      .finally(() => setLoading(false));
  }, [tournamentId, isAuthenticated]);

  const handleRegister = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!tournamentId) return;
    setActionLoading(true);
    try {
      await registerTournament(tournamentId);
      setIsRegistered(true);
    } catch (_err) {
      setError('Could not register.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!tournamentId) return null;
  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!tournament) return <p className="text-slate-500">Tournament not found.</p>;

  return (
    <div className="space-y-6">
      <button type="button" className="flex items-center gap-2 text-slate-500 hover:text-slate-700" onClick={() => router.back()}>
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>
      <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-sm text-slate-500 mt-1">{tournament.time_control} • {tournament.type}</p>
        <p className="text-sm text-slate-500 mt-1">{tournament.participants_count ?? 0} players</p>
        {!isRegistered && (
          <button
            type="button"
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white font-semibold disabled:opacity-60"
            onClick={handleRegister}
            disabled={actionLoading}
          >
            {actionLoading ? 'Registering...' : 'Register'}
          </button>
        )}
        {isRegistered && <p className="mt-4 text-sm text-green-600">You are registered.</p>}
      </div>
      <div>
        <h2 className="text-lg font-bold mb-3">Standings</h2>
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {standings.length ? (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {standings.slice(0, 20).map((entry, i) => (
                <li key={entry?.user_id ?? i} className="flex items-center justify-between px-4 py-3">
                  <span className="font-medium">#{i + 1} {entry?.username ?? '—'}</span>
                  <span className="text-slate-500">{entry?.score ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-slate-500">No standings yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
