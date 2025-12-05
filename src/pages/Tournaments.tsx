import { useEffect, useState } from 'react';
import api from '../api/client';

interface Tournament {
  id: number;
  name: string;
  type: string;
  start_at: string;
  time_control: string;
  status: string;
  arena_duration_minutes?: number;
  swiss_rounds?: number;
}

export default function Tournaments() {
  const [rows, setRows] = useState<Tournament[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/api/games/tournaments/')
      .then((r) => setRows(r.data?.results || []))
      .catch(() => setError('Could not load tournaments'));
    
    // Disable page scrolling for this page
    const html = document.documentElement;
    const body = document.body;
    const originalHtmlOverflow = html.style.overflow;
    const originalBodyOverflow = body.style.overflow;
    const originalBodyHeight = body.style.height;
    
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.height = '100vh';
    
    return () => {
      // Re-enable scrolling when component unmounts
      html.style.overflow = originalHtmlOverflow;
      body.style.overflow = originalBodyOverflow;
      body.style.height = originalBodyHeight;
    };
  }, []);

  return (
    <div className="layout" style={{ 
      height: 'calc(100vh - 100px)', 
      maxHeight: 'calc(100vh - 100px)',
      overflow: 'hidden', 
      display: 'flex', 
      flexDirection: 'column', 
      paddingTop: 24, 
      paddingBottom: 24,
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexShrink: 0, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ 
            fontSize: 32, 
            fontWeight: 800, 
            marginBottom: 8,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            🏟️ Tournaments
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 16, margin: 0 }}>
            Compete in structured chess tournaments
          </p>
        </div>
        <a href="/tournaments/create" className="btn btn-gold" style={{ fontSize: 15, padding: '12px 24px', fontWeight: 600 }}>
          ➕ Create Tournament
        </a>
      </div>
      {error && (
        <div className="card" style={{ 
          color: 'var(--danger)', 
          flexShrink: 0,
          padding: 16,
          background: 'rgba(239, 83, 80, 0.1)',
          border: '1px solid var(--danger)',
          borderRadius: 8,
          fontSize: 15
        }}>
          ❌ {error}
        </div>
      )}
      <div 
        className="grid-2 games-list-scrollable" 
        style={{ 
          overflowY: 'auto', 
          overflowX: 'hidden',
          flex: '1 1 auto', 
          minHeight: 0,
          maxHeight: '100%',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(26, 34, 51, 0.6) transparent'
        }}
      >
        {rows.map((t) => (
          <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }} onClick={() => window.location.href = `/tournaments/${t.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t.type} • {t.time_control}</div>
              </div>
              <span className="pill">{t.status}</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Starts {new Date(t.start_at).toLocaleString()}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 12 }}>
              {t.type === 'arena' && <span>Arena duration: {t.arena_duration_minutes} min</span>}
              {t.type === 'swiss' && <span>Swiss rounds: {t.swiss_rounds}</span>}
            </div>
            <a 
              href={`/tournaments/${t.id}`} 
              className="btn btn-primary" 
              style={{ marginTop: 'auto', width: 'fit-content' }}
              onClick={(e) => e.stopPropagation()}
            >
              View Tournament
            </a>
          </div>
        ))}
        {rows.length === 0 && !error && (
          <div className="card" style={{ 
            textAlign: 'center', 
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: 48 }}>🏆</span>
            <h3 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 600, margin: 0 }}>No tournaments yet</h3>
            <p style={{ color: 'var(--muted)', fontSize: 15, margin: 0 }}>Be the first to create one!</p>
          </div>
        )}
      </div>
    </div>
  );
}
