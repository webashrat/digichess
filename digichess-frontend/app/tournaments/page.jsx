'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Trophy } from 'lucide-react';
import { listTournaments } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const STATUS_OPTIONS = [
  { id: 'live', label: 'Live' },
  { id: 'pending', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

function normalizeStatus(status) {
  if (!status) return 'pending';
  const value = String(status).toLowerCase();
  if (value === 'active' || value === 'live') return 'live';
  if (value === 'completed' || value === 'finished' || value === 'ended') return 'completed';
  return 'pending';
}

const STATUS_STYLES = {
  live: { badge: 'bg-red-500 text-white', label: 'LIVE', gradient: 'from-blue-900 to-primary', button: 'Join Now' },
  pending: { badge: 'bg-amber-500 text-white', label: 'UPCOMING', gradient: 'from-slate-700 to-slate-900', button: 'Register' },
  completed: { badge: 'bg-emerald-500 text-white', label: 'COMPLETED', gradient: 'from-emerald-900 to-teal-900', button: 'Results' },
};

export default function TournamentsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('live');

  useEffect(() => {
    setLoading(true);
    setError(null);
    listTournaments({ page_size: 20 })
      .then((data) => setTournaments(data.results || []))
      .catch(() => setError('Failed to load tournaments.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => tournaments.filter((t) => normalizeStatus(t.status) === statusFilter), [tournaments, statusFilter]);

  const handleCreate = () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setError('Tournament creation will be available soon.');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tournaments</h1>
      <button
        type="button"
        className="w-full relative overflow-hidden rounded-xl bg-primary p-4 shadow-lg shadow-primary/25 hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        onClick={handleCreate}
      >
        <PlusCircle className="w-8 h-8 text-white" />
        <span className="text-white text-lg font-bold">Create Tournament</span>
      </button>

      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setStatusFilter(opt.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${statusFilter === opt.id ? 'bg-primary text-white border-primary' : 'bg-surface-light dark:bg-surface-dark border-slate-200 dark:border-slate-700 text-slate-500'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading tournaments...</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((tournament) => {
            const norm = normalizeStatus(tournament.status);
            const style = STATUS_STYLES[norm];
            return (
              <button
                key={tournament.id}
                type="button"
                className={`bg-gradient-to-r ${style.gradient} rounded-xl p-4 text-white text-left relative overflow-hidden`}
                onClick={() => router.push(`/tournaments/${tournament.id}`)}
              >
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span>
                    <h3 className="font-bold text-lg mt-2">{tournament.name}</h3>
                    <p className="text-xs opacity-80 mt-1">{tournament.time_control} • {tournament.type}</p>
                    <p className="text-xs opacity-80 mt-1">{tournament.participants_count || 0} players</p>
                  </div>
                  <Trophy className="w-14 h-14 text-white/20" />
                </div>
                <div className="relative z-10 mt-4">
                  <span className="inline-flex bg-white text-primary text-xs font-bold px-3 py-1.5 rounded-lg">{style.button}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {!filtered.length && !loading && <p className="text-sm text-slate-500">No tournaments found.</p>}
    </div>
  );
}
