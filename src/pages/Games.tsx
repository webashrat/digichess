import { useEffect, useState } from 'react';
import api from '../api/client';
import { GameSummary } from '../api/types';
import IdentityStrip from '../components/IdentityStrip';
import { fetchMe } from '../api/account';
import { setHashRoute } from '../utils/hashNavigate';

export default function Games() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [me, setMe] = useState<{ id: number } | null>(null);

  useEffect(() => {
    api
      .get('/api/games/public/', { params: { status: 'active', page_size: 20 } })
      .then((r) => setGames(r.data?.results || r.data || []))
      .catch(() => {});
    fetchMe()
      .then((u) => setMe({ id: u.id }))
      .catch(() => {});
  }, []);

  return (
    <div className="layout" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Games</h1>
          <p className="page-subtitle">Watch ongoing chess matches in real-time</p>
        </div>
      </div>
      
      {games.length === 0 && (
        <div className="card" style={{ 
          textAlign: 'center', 
          padding: 48,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12
        }}>
          <span style={{ fontSize: 48 }}>🎲</span>
          <h3 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 600, margin: 0 }}>No games right now</h3>
          <p style={{ color: 'var(--muted)', fontSize: 15, margin: 0 }}>Check back later or create a new game</p>
        </div>
      )}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {games.map((g) => (
          <div key={g.id} className="card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 12,
            padding: 20,
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(19, 91, 236, 0.35)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onClick={() => setHashRoute(`/games/${g.id}`)}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <IdentityStrip user={g.white} mode={g.mode} />
              <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>VS</span>
              <IdentityStrip user={g.black} mode={g.mode} />
              <a 
                className="btn btn-primary"
                href={`#/games/${g.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 14,
                  padding: '10px 20px',
                  fontWeight: 600,
                  background:
                    me && (g.white.id === me.id || g.black.id === me.id)
                      ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                      : 'linear-gradient(135deg, var(--primary), var(--primary-strong))',
                  color: '#ffffff',
                  border:
                    me && (g.white.id === me.id || g.black.id === me.id)
                      ? '1px solid rgba(34, 197, 94, 0.6)'
                      : '1px solid rgba(19, 91, 236, 0.6)'
                }}
              >
                {me && (g.white.id === me.id || g.black.id === me.id) ? '▶️ Play' : '👀 Watch'}
              </a>
            </div>
            <div style={{ 
              color: 'var(--muted)', 
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <span>⏱️ {g.time_control}</span>
              <span>👁️ {g.spectators ?? 0} spectators</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
