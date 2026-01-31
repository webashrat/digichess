import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { fetchMe } from '../api/account';

interface Tournament {
  id: number;
  name: string;
  description: string;
  type: string;
  time_control: string;
  initial_time_seconds: number;
  increment_seconds: number;
  start_at: string;
  status: string;
  started_at?: string;
  finished_at?: string;
  arena_duration_minutes?: number;
  swiss_rounds?: number;
  rated: boolean;
  password?: string;
  is_private?: boolean;
  participants_count: number;
  creator: { id: number; username: string };
}

interface Standing {
  user_id: number;
  username: string;
  score: number;
  buchholz?: number;
  median_buchholz?: number;
}

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!id) return;
    
    const loadTournament = async () => {
      try {
        const [tourRes, standingsRes] = await Promise.all([
          api.get(`/api/games/tournaments/${id}/`),
          api.get(`/api/games/tournaments/${id}/standings/`).catch(() => ({ data: { standings: [] } }))
        ]);
        
        setTournament(tourRes.data);
        setStandings(standingsRes.data.standings || []);
        
        // Check if user is registered
        try {
          const me = await fetchMe();
          setIsCreator(tourRes.data.creator.id === me.id);
          // Check registration status by looking at standings
          const isReg = standingsRes.data.standings?.some((s: Standing) => s.user_id === me.id);
          setIsRegistered(isReg);
        } catch {
          // User not logged in
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load tournament');
      } finally {
        setLoading(false);
      }
    };
    
    loadTournament();
  }, [id]);

  const handleJoin = async () => {
    if (!tournament || !id) return;
    
    // Always prompt for password (user can leave empty if tournament is public)
    // Backend will validate if password is required
    setPasswordPrompt(true);
  };

  const doJoin = async () => {
    if (!id) return;
    
    setJoinLoading(true);
    setJoinError('');
    
    try {
      const payload: any = { tournament_id: parseInt(id) };
      // Always send password field, even if empty (backend will validate)
      payload.password = password || '';
      
      await api.post(`/api/games/tournaments/${id}/register/`, payload);
      setIsRegistered(true);
      setPasswordPrompt(false);
      setPassword('');
      
      // Reload tournament to get updated participant count
      const res = await api.get(`/api/games/tournaments/${id}/`);
      setTournament(res.data);
      
      // Reload standings
      const standingsRes = await api.get(`/api/games/tournaments/${id}/standings/`);
      setStandings(standingsRes.data.standings || []);
    } catch (err: any) {
      setJoinError(err.response?.data?.detail || 'Failed to join tournament');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleStart = async () => {
    if (!id) return;
    
    try {
      await api.post(`/api/games/tournaments/${id}/start/`);
      navigate(`/tournaments/${id}`);
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start tournament');
    }
  };

  if (loading) {
    return (
      <div className="layout">
        <div className="card">Loading...</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="layout">
        <div className="card" style={{ color: 'var(--danger)' }}>
          {error || 'Tournament not found'}
        </div>
        <a href="#/tournaments" className="btn btn-info" style={{ fontSize: 14, padding: '10px 20px' }}>← Back to Tournaments</a>
      </div>
    );
  }

  const canJoin = tournament.status === 'pending' && new Date(tournament.start_at) > new Date();
  const timeMinutes = tournament.initial_time_seconds / 60;
  const startDate = new Date(tournament.start_at);
  const now = new Date();
  const secondsUntilStart = Math.max(0, Math.floor((startDate.getTime() - now.getTime()) / 1000));

  return (
    <div className="layout" style={{ height: 'calc(100vh - 100px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <a href="#/tournaments" style={{ color: 'var(--muted)', textDecoration: 'none' }}>← Tournaments</a>
          </div>
          <h1 style={{ margin: 0 }}>{tournament.name}</h1>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
            {tournament.type.charAt(0).toUpperCase() + tournament.type.slice(1)} • {tournament.time_control} • {timeMinutes}+{tournament.increment_seconds} • {tournament.rated ? 'Rated' : 'Unrated'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
          <span className="pill" style={{ fontSize: 14 }}>
            {tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}
          </span>
          {canJoin && !isRegistered && (
            <button 
              className="btn btn-gold" 
              onClick={handleJoin}
              disabled={joinLoading}
              style={{ fontSize: 15, padding: '12px 24px', fontWeight: 700 }}
            >
              {joinLoading ? '⏳ Joining...' : '🏆 Join Tournament'}
            </button>
          )}
          {isRegistered && tournament.status === 'pending' && (
            <div style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>
              ✓ Registered
            </div>
          )}
          {isCreator && tournament.status === 'pending' && (
            <button className="btn btn-success" onClick={handleStart} style={{ fontSize: 15, padding: '12px 24px', fontWeight: 700 }}>
              ▶️ Start Tournament
            </button>
          )}
        </div>
      </div>

      {/* Password Prompt Modal */}
      {passwordPrompt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: 400, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Join Tournament</h3>
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
              {tournament.is_private ? 'This tournament requires an entry code.' : 'Leave empty if tournament is public.'}
            </div>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Entry code (optional)"
              style={{ width: '100%', marginBottom: 12 }}
              onKeyPress={(e) => e.key === 'Enter' && doJoin()}
              autoFocus
            />
            {joinError && <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 12 }}>{joinError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gold" onClick={doJoin} disabled={joinLoading} style={{ fontSize: 15, padding: '12px 24px', fontWeight: 700 }}>
                {joinLoading ? '⏳ Joining...' : '🏆 Join'}
              </button>
              <button 
                className="btn btn-danger" 
                onClick={() => {
                  setPasswordPrompt(false);
                  setPassword('');
                  setJoinError('');
                }}
                style={{ fontSize: 15, padding: '12px 24px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {joinError && !passwordPrompt && (
        <div className="card" style={{ color: 'var(--danger)', flexShrink: 0, marginBottom: 16 }}>
          {joinError}
        </div>
      )}

      {/* Tournament Info */}
      <div className="grid-2" style={{ flex: '1 1 auto', overflow: 'hidden', minHeight: 0 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <h3 style={{ margin: 0 }}>Tournament Info</h3>
          
          {tournament.description && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Description</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{tournament.description}</div>
            </div>
          )}
          
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Created by</div>
            <div>{tournament.creator.username}</div>
          </div>
          
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Start Time</div>
            <div>{startDate.toLocaleString()}</div>
            {secondsUntilStart > 0 && tournament.status === 'pending' && (
              <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 4 }}>
                Starts in {Math.floor(secondsUntilStart / 60)}m {secondsUntilStart % 60}s
              </div>
            )}
          </div>
          
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Participants</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{tournament.participants_count}</div>
          </div>
          
          {tournament.type === 'arena' && tournament.arena_duration_minutes && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Duration</div>
              <div>{tournament.arena_duration_minutes} minutes</div>
            </div>
          )}
          
          {tournament.type === 'swiss' && tournament.swiss_rounds && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Rounds</div>
              <div>{tournament.swiss_rounds}</div>
            </div>
          )}
        </div>

        {/* Standings */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ margin: 0, marginBottom: 12 }}>Standings</h3>
          <div style={{ overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            {standings.length === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                No standings yet
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)' }}>#</th>
                    <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)' }}>Player</th>
                    <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>Score</th>
                    {tournament.type === 'swiss' && (
                      <>
                        <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>Buchholz</th>
                        <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>Med. B.</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {standings.map((standing, idx) => (
                    <tr key={standing.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: idx < 3 ? 600 : 400 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 4px' }}>{standing.username}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>{standing.score}</td>
                      {tournament.type === 'swiss' && (
                        <>
                          <td style={{ padding: '8px 4px', textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                            {standing.buchholz?.toFixed(1) || '0.0'}
                          </td>
                          <td style={{ padding: '8px 4px', textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                            {standing.median_buchholz?.toFixed(1) || '0.0'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

