import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { GameCreatePayload, Mode, AccountListItem } from '../api/types';
import { fetchAccounts } from '../api/users';
import { fetchMe } from '../api/account';
import { flagFromCode } from '../utils/flags';
import { setHashRoute } from '../utils/hashNavigate';

const modeOptions: Mode[] = ['bullet', 'blitz', 'rapid', 'classical', 'custom'];

export default function GameCreate() {
  const [searchParams] = useSearchParams();
  const opponentIdFromUrl = searchParams.get('opponent_id');
  
  const [payload, setPayload] = useState<GameCreatePayload>({ 
    mode: 'blitz', 
    preferred_color: 'auto', 
    rated: true,
    opponent_id: opponentIdFromUrl ? Number(opponentIdFromUrl) : undefined
  });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [me, setMe] = useState<{ id: number } | null>(null);
  const [timeMinutes, setTimeMinutes] = useState(5);
  const [incrementSeconds, setIncrementSeconds] = useState(2);

  useEffect(() => {
    fetchAccounts({ page_size: 100 })
      .then((res) => setAccounts(res.results || []))
      .catch(() => {});
    fetchMe()
      .then((u) => setMe({ id: u.id }))
      .catch(() => {});
    
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

  // Set opponent_id from URL when accounts are loaded
  useEffect(() => {
    if (opponentIdFromUrl && accounts.length > 0 && !payload.opponent_id) {
      const opponentId = Number(opponentIdFromUrl);
      const opponentExists = accounts.some((a: AccountListItem) => a.id === opponentId);
      if (opponentExists) {
        setPayload((p) => ({ ...p, opponent_id: opponentId }));
      }
    }
  }, [opponentIdFromUrl, accounts, payload.opponent_id]);

  const update = (field: keyof GameCreatePayload, value: any) => {
    setPayload((p) => ({ ...p, [field]: value }));
  };

  const getTimeRange = (mode: Mode) => {
    switch (mode) {
      case 'bullet':
        return { min: 1, max: 3 }; // 0<t<180s -> 1-3 minutes slider
      case 'blitz':
        return { min: 3, max: 10 }; // 180-599s
      case 'rapid':
        return { min: 10, max: 25 }; // 600-1500s
      case 'classical':
        return { min: 25, max: 120 }; // >1500s up to 7200s
      case 'custom':
      default:
        return { min: 1, max: 120 };
    }
  };

  // Reset time/increment when mode changes (for non-custom modes)
  useEffect(() => {
    if (payload.mode !== 'custom') {
      const { min } = getTimeRange(payload.mode);
      const defaultTime = min * 60;
      setTimeMinutes(min);
      setIncrementSeconds(2);
      setPayload((p) => ({
        ...p,
        white_time_seconds: defaultTime,
        black_time_seconds: defaultTime,
        white_increment_seconds: 2,
        black_increment_seconds: 2
      }));
    }
  }, [payload.mode]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    
    // For non-custom modes, use symmetric time/increment
    const isCustom = payload.mode === 'custom';
    const whiteTime = isCustom ? payload.white_time_seconds : timeMinutes * 60;
    const blackTime = isCustom ? payload.black_time_seconds : timeMinutes * 60;
    const whiteInc = isCustom ? payload.white_increment_seconds : incrementSeconds;
    const blackInc = isCustom ? payload.black_increment_seconds : incrementSeconds;
    
    api
      .post('/api/games/', {
        opponent_id: payload.opponent_id,
        preferred_color: payload.preferred_color || 'white',
        time_control: payload.mode,
        white_time_seconds: whiteTime,
        black_time_seconds: blackTime,
        white_increment_seconds: whiteInc,
        black_increment_seconds: blackInc,
        rated: payload.rated !== false // Default to true if not specified
      })
      .then((res) => {
        setMsg('Game created. Redirecting…');
        const id = res.data?.id;
        if (id) setHashRoute(`/games/${id}`);
      })
      .catch((err) => {
        // Extract error message from response
        const responseData = err.response?.data;
        let errorMsg = 'Failed to create game';
        
        if (responseData) {
          // Django REST Framework typically uses 'detail' field
          if (responseData.detail) {
            if (typeof responseData.detail === 'string') {
              errorMsg = responseData.detail;
            } else if (Array.isArray(responseData.detail)) {
              errorMsg = responseData.detail.join(', ');
            } else {
              errorMsg = String(responseData.detail);
            }
          }
          // Check for other common error fields
          else if (responseData.error) {
            errorMsg = typeof responseData.error === 'string' ? responseData.error : String(responseData.error);
          }
          else if (responseData.message) {
            errorMsg = typeof responseData.message === 'string' ? responseData.message : String(responseData.message);
          }
          // Check for validation errors (non_field_errors or field-specific errors)
          else if (responseData.non_field_errors) {
            const errors = Array.isArray(responseData.non_field_errors) 
              ? responseData.non_field_errors 
              : [responseData.non_field_errors];
            errorMsg = errors.join(', ');
          }
          // If responseData is a string
          else if (typeof responseData === 'string') {
            errorMsg = responseData;
          }
          // Try to extract first error from object
          else if (typeof responseData === 'object') {
            const keys = Object.keys(responseData);
            if (keys.length > 0) {
              const firstValue = responseData[keys[0]];
              if (Array.isArray(firstValue)) {
                errorMsg = firstValue.join(', ');
              } else {
                errorMsg = String(firstValue);
              }
            }
          }
        }
        
        setError(errorMsg);
      });
  };

  return (
    <div className="layout" style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      paddingTop: 16, 
      paddingBottom: 16,
      height: 'calc(100vh - 100px)',
      maxHeight: 'calc(100vh - 100px)',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      <form className="card" style={{ 
        width: 520, 
        maxWidth: '100%', 
        maxHeight: 'calc(100vh - 140px)',
        display: 'flex', 
        flexDirection: 'column', 
        gap: 16,
        background: 'linear-gradient(160deg, rgba(22, 32, 54, 0.95), rgba(12, 18, 32, 0.98))',
        border: '1px solid rgba(44, 230, 194, 0.2)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }} onSubmit={submit}>
        <div style={{ 
          overflowY: 'auto', 
          overflowX: 'hidden',
          flex: '1 1 auto',
          minHeight: 0,
          paddingRight: 4,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(26, 34, 51, 0.6) transparent'
        }}
        className="games-list-scrollable"
        >
        <div style={{ marginBottom: 6 }}>
          <h1 style={{ 
            fontSize: 24, 
            fontWeight: 800, 
            marginBottom: 4,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            ➕ Create Game
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Set up a new chess game with your preferred settings
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {modeOptions.map((m) => (
            <button
              key={m}
              type="button"
              className="btn btn-ghost"
              style={{ borderColor: payload.mode === m ? 'var(--accent)' : 'var(--border)', color: payload.mode === m ? 'var(--accent)' : undefined }}
              onClick={() => update('mode', m)}
            >
              {m}
            </button>
          ))}
        </div>
        {payload.mode === 'custom' ? (
          <div className="grid-2">
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>White time (minutes)</div>
              <input
                type="range"
                min={getTimeRange(payload.mode).min}
                max={getTimeRange(payload.mode).max}
                value={(payload.white_time_seconds || getTimeRange(payload.mode).min * 60) / 60}
                onChange={(e) => update('white_time_seconds', Number(e.target.value) * 60)}
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {(payload.white_time_seconds || getTimeRange(payload.mode).min * 60) / 60} min
              </div>
            </label>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Black time (minutes)</div>
              <input
                type="range"
                min={getTimeRange(payload.mode).min}
                max={getTimeRange(payload.mode).max}
                value={(payload.black_time_seconds || getTimeRange(payload.mode).min * 60) / 60}
                onChange={(e) => update('black_time_seconds', Number(e.target.value) * 60)}
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {(payload.black_time_seconds || getTimeRange(payload.mode).min * 60) / 60} min
              </div>
            </label>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>White increment (0-60s)</div>
              <input
                type="range"
                min={0}
                max={60}
                value={payload.white_increment_seconds ?? 0}
                onChange={(e) => update('white_increment_seconds', Number(e.target.value))}
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{payload.white_increment_seconds ?? 0} s</div>
            </label>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Black increment (0-60s)</div>
              <input
                type="range"
                min={0}
                max={60}
                value={payload.black_increment_seconds ?? 0}
                onChange={(e) => update('black_increment_seconds', Number(e.target.value))}
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{payload.black_increment_seconds ?? 0} s</div>
            </label>
          </div>
        ) : (
          <div className="grid-2">
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Time (minutes)</div>
              <input
                type="range"
                min={getTimeRange(payload.mode).min}
                max={getTimeRange(payload.mode).max}
                value={timeMinutes}
                onChange={(e) => {
                  const mins = Number(e.target.value);
                  setTimeMinutes(mins);
                  setPayload((p) => ({
                    ...p,
                    white_time_seconds: mins * 60,
                    black_time_seconds: mins * 60
                  }));
                }}
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{timeMinutes} min</div>
            </label>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Increment (0-60s)</div>
              <input
                type="range"
                min={0}
                max={60}
                value={incrementSeconds}
                onChange={(e) => {
                  const inc = Number(e.target.value);
                  setIncrementSeconds(inc);
                  setPayload((p) => ({
                    ...p,
                    white_increment_seconds: inc,
                    black_increment_seconds: inc
                  }));
                }}
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{incrementSeconds} s</div>
            </label>
          </div>
        )}
        {payload.mode !== 'custom' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={payload.rated !== false}
              onChange={(e) => update('rated', e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Rated game</span>
          </label>
        )}
        <label>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Opponent (optional)</div>
          <select 
            value={payload.opponent_id || ''} 
            onChange={(e) => update('opponent_id', e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Auto-pair</option>
            {accounts
              .filter((a) => (me ? a.id !== me.id : true))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {flagFromCode(a.country)} {a.username} ({(a.country || 'INTL').toString().toUpperCase()})
                </option>
              ))}
          </select>
        </label>
        <label>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Color preference</div>
          <select value={payload.preferred_color} onChange={(e) => update('preferred_color', e.target.value as any)}>
            <option value="auto">Auto (default white)</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        </div>
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {error && <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 12 }}>{error}</div>}
          {msg && <div style={{ color: 'var(--accent)', fontSize: 14, marginBottom: 12 }}>{msg}</div>}
          <button className="btn btn-primary" type="submit" style={{ width: '100%', fontSize: 16, padding: '14px 24px', fontWeight: 700 }}>🎮 Create Game</button>
        </div>
      </form>
    </div>
  );
}
