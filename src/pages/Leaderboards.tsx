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
    <div className="layout" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 800, 
          marginBottom: 8,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          🏆 Leaderboards
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 16, margin: 0 }}>
          Top players ranked by rating
        </p>
      </div>
      
      <div className="card" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        padding: 20,
        marginBottom: 16
      }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Time Control</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {modes.map((m) => {
            const modeColors: Record<string, { active: string; inactive: string; bg: string; border: string }> = {
              bullet: { active: '#ff6b6b', inactive: '#ff6b6b80', bg: 'rgba(255, 107, 107, 0.15)', border: 'rgba(255, 107, 107, 0.4)' },
              blitz: { active: '#4ecdc4', inactive: '#4ecdc480', bg: 'rgba(78, 205, 196, 0.15)', border: 'rgba(78, 205, 196, 0.4)' },
              rapid: { active: '#45b7d1', inactive: '#45b7d180', bg: 'rgba(69, 183, 209, 0.15)', border: 'rgba(69, 183, 209, 0.4)' },
              classical: { active: '#f5c451', inactive: '#f5c45180', bg: 'rgba(245, 196, 81, 0.15)', border: 'rgba(245, 196, 81, 0.4)' },
              digiquiz: { active: '#a78bfa', inactive: '#a78bfa80', bg: 'rgba(167, 139, 250, 0.15)', border: 'rgba(167, 139, 250, 0.4)' }
            };
            const colors = modeColors[m] || { active: 'var(--accent)', inactive: 'var(--muted)', bg: 'rgba(44, 230, 194, 0.15)', border: 'rgba(44, 230, 194, 0.4)' };
            const isActive = mode === m;
            
            return (
              <button
                key={m}
                className="btn btn-ghost"
                style={{ 
                  borderColor: isActive ? colors.border : 'var(--border)', 
                  color: isActive ? colors.active : colors.inactive,
                  background: isActive ? colors.bg : 'transparent',
                  fontWeight: isActive ? 700 : 500,
                  textTransform: 'capitalize',
                  fontSize: 14
                }}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Rank</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Player</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Rating</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>{mode === 'digiquiz' ? 'Correct' : 'Wins'}</th>
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
              <tr key={r.username} style={{ 
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(44, 230, 194, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              >
                <td style={{ 
                  padding: '12px 16px', 
                  fontSize: 16, 
                  fontWeight: idx < 3 ? 700 : 600,
                  color: idx === 0 ? '#f5c451' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : 'var(--text)'
                }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </td>
                <td style={{ 
                  padding: '12px 16px',
                  fontSize: 15
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FlagIcon code={r.country} size={18} />
                    <a 
                      href={`#/profile/${r.username}`} 
                      style={{ 
                        color: 'var(--text)', 
                        fontWeight: 600,
                        textDecoration: 'none',
                        transition: 'color 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--accent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text)';
                      }}
                    >
                      {r.username}
                    </a>
                  </div>
                </td>
                <td style={{ 
                  padding: '12px 16px',
                  fontSize: 16, 
                  fontWeight: 700,
                  color: 'var(--accent)'
                }}>
                  {mode === 'digiquiz' 
                    ? (r.rating !== undefined && r.rating !== null ? r.rating : '—')
                    : (r.rating || '—')
                  }
                </td>
                <td style={{ 
                  padding: '12px 16px',
                  fontSize: 15,
                  color: 'var(--text)'
                }}>
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
