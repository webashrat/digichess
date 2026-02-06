import { useEffect, useState } from 'react';
import api from '../api/client';
import { LeaderboardRow, Mode } from '../api/types';
import FlagIcon from '../components/FlagIcon';

const modes: (Mode | 'digiquiz')[] = ['bullet', 'blitz', 'rapid', 'classical', 'digiquiz'];

export default function Leaderboards() {
  const [mode, setMode] = useState<Mode | 'digiquiz'>('blitz');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const url =
      mode === 'digiquiz'
        ? '/api/games/leaderboard/digiquiz/'
        : '/api/games/leaderboard/ratings/';
    const params = mode === 'digiquiz' ? {} : { mode };
    api
      .get(url, { params })
      .then((r) => {
        // Normalize response: map rating_digiquiz to rating for digiquiz mode
        // Also filter out bots
        const results = (r.data?.results || [])
          .filter((item: any) => !item.is_bot) // Filter out bots
          .map((item: any) => {
            if (mode === 'digiquiz') {
              return {
                ...item,
                rating: item.rating_digiquiz ?? item.rating ?? 0,
                wins: item.digiquiz_correct ?? item.wins ?? 0
              };
            }
            return item;
          });
        setRows(results);
      })
      .catch(() => setError('Failed to load leaderboard'))
      .finally(() => setLoading(false));
  }, [mode]);

  return (
    <div className="layout" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">🏆 Leaderboards</h1>
          <p className="page-subtitle">Top players ranked by rating</p>
        </div>
      </div>

      <div className="card card-header" style={{ marginBottom: 12 }}>
        <h2 className="card-title">Time Control</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {modes.map((m) => {
            const isActive = mode === m;
            return (
              <button
                key={m}
                className={isActive ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={() => setMode(m)}
                style={{ textTransform: 'capitalize' }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <table className="table table-hover" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Rating</th>
              <th>{mode === 'digiquiz' ? 'Correct' : 'Wins'}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--muted)', fontSize: 15, padding: '24px', textAlign: 'center' }}>
                  <span>⏳</span> Loading leaderboard...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--danger)', fontSize: 15, padding: '24px', textAlign: 'center' }}>
                  <span>❌</span> {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--muted)', fontSize: 15, padding: '24px', textAlign: 'center' }}>
                  <span>📊</span> No data available yet
                </td>
              </tr>
            )}
            {!loading && !error && rows.map((r, idx) => (
              <tr key={r.username}>
                <td style={{ fontSize: 16, fontWeight: idx < 3 ? 700 : 600, color: idx === 0 ? '#f5c451' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : 'var(--text)' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </td>
                <td style={{ fontSize: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FlagIcon code={r.country} size={18} />
                    <a 
                      href={`#/profile/${r.username}`} 
                      className="link-inline"
                    >
                      {r.username}
                    </a>
                  </div>
                </td>
                <td style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                  {mode === 'digiquiz' 
                    ? (r.rating !== undefined && r.rating !== null ? r.rating : '—')
                    : (r.rating || '—')
                  }
                </td>
                <td style={{ fontSize: 15 }}>
                  {mode === 'digiquiz' ? r.wins ?? '-' : r.wins ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
