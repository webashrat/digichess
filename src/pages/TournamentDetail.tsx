import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { fetchMe } from '../api/account';
import FlagIcon from '../components/FlagIcon';
import { fetchAccountDetail } from '../api/users';

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
  winners?: string[];
  arena_duration_minutes?: number;
  swiss_rounds?: number;
  current_round?: number;
  rated: boolean;
  password?: string;
  is_private?: boolean;
  participants_count: number;
  creator: { id: number; username: string };
}

interface Standing {
  user_id: number;
  username: string;
  country?: string;
  score: number;
  streak?: number;
  buchholz?: number;
  median_buchholz?: number;
}

interface MeStatus {
  game_id: number | null;
  is_registered: boolean;
  has_played: boolean;
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
  const [meId, setMeId] = useState<number | null>(null);
  const [secondsUntilStart, setSecondsUntilStart] = useState(0);
  const [meStatus, setMeStatus] = useState<MeStatus | null>(null);
  const [redirectedGameId, setRedirectedGameId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [standingsPage, setStandingsPage] = useState(1);
  const [profileCountries, setProfileCountries] = useState<Record<number, string>>({});
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    type: 'arena',
    time_control: 'blitz',
    initial_time_seconds: 300,
    increment_seconds: 0,
    start_at: '',
    arena_duration_minutes: 60,
    swiss_rounds: 5,
    rated: true,
    password: '',
    clear_password: false
  });

  const toLocalInputValue = (iso: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const formatScore = (value: number) => {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
  };

  const tournamentTypes = [
    { value: 'knockout', label: 'Knockout' },
    { value: 'round_robin', label: 'Round Robin' },
    { value: 'arena', label: 'Arena' },
    { value: 'swiss', label: 'Swiss' }
  ];

  const timeControls = ['bullet', 'blitz', 'rapid', 'classical', 'custom'];

  const updateEditField = (field: string, value: any) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const loadTournament = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) {
      setLoading(true);
    }
    try {
      const [tourRes, standingsRes] = await Promise.all([
        api.get(`/api/games/tournaments/${id}/`),
        api.get(`/api/games/tournaments/${id}/standings/`).catch(() => ({ data: { standings: [] } }))
      ]);
      setTournament(tourRes.data);
      setStandings(standingsRes.data.standings || []);
      setError('');
    } catch (err: any) {
      if (!silent) {
        setError(err.response?.data?.detail || 'Failed to load tournament');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [id]);

  const loadMeStatus = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/api/games/tournaments/${id}/my-game/`);
      setMeStatus(res.data);
    } catch {
      setMeStatus(null);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((me) => {
        if (active) {
          setMeId(me.id);
          loadMeStatus();
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [loadMeStatus]);

  useEffect(() => {
    if (!id) return;
    loadTournament(false);
  }, [id, loadTournament]);

  useEffect(() => {
    if (!id) return;
    if (tournament?.status === 'completed') return;
    const interval = setInterval(() => {
      loadTournament(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [id, tournament?.status, loadTournament]);

  useEffect(() => {
    if (!id || !meId) return;
    if (tournament?.status === 'completed') return;
    loadMeStatus();
    const interval = setInterval(() => {
      loadMeStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [id, meId, tournament?.status, loadMeStatus]);

  useEffect(() => {
    if (!tournament || meId === null) return;
    setIsCreator(tournament.creator.id === meId);
  }, [tournament, meId]);

  useEffect(() => {
    if (!meStatus) {
      setIsRegistered(false);
      return;
    }
    setIsRegistered(Boolean(meStatus.is_registered));
  }, [meStatus]);

  useEffect(() => {
    if (!tournament) return;
    const updateCountdown = () => {
      const startDate = new Date(tournament.start_at);
      const now = new Date();
      const remaining = Math.max(0, Math.floor((startDate.getTime() - now.getTime()) / 1000));
      setSecondsUntilStart(remaining);
    };
    updateCountdown();
    if (tournament.status !== 'pending') {
      return;
    }
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [tournament]);

  useEffect(() => {
    if (!tournament || !meStatus?.game_id) return;
    if (tournament.status !== 'active') return;
    if (redirectedGameId === meStatus.game_id) return;
    setRedirectedGameId(meStatus.game_id);
    navigate(`/games/${meStatus.game_id}`);
  }, [tournament, meStatus, redirectedGameId, navigate]);

  const handleJoin = async () => {
    if (!tournament || !id) return;

    if (tournament.is_private) {
      setPasswordPrompt(true);
      return;
    }
    setPassword('');
    doJoin('');
  };

  const doJoin = async (codeOverride?: string) => {
    if (!id) return;
    
    setJoinLoading(true);
    setJoinError('');
    
    try {
      const payload: any = { tournament_id: parseInt(id) };
      // Always send password field, even if empty (backend will validate)
      const code = codeOverride !== undefined ? codeOverride : password;
      payload.password = code || '';
      
      await api.post(`/api/games/tournaments/${id}/register/`, payload);
      setIsRegistered(true);
      setPasswordPrompt(false);
      setPassword('');

      await loadTournament(true);
      await loadMeStatus();
    } catch (err: any) {
      setJoinError(err.response?.data?.detail || 'Failed to join tournament');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleUnregister = async () => {
    if (!id) return;
    setJoinLoading(true);
    setJoinError('');
    try {
      await api.post(`/api/games/tournaments/${id}/unregister/`);
      await loadTournament(true);
      await loadMeStatus();
    } catch (err: any) {
      setJoinError(err.response?.data?.detail || 'Failed to unregister');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleStart = async () => {
    if (!id) return;
    
    try {
      await api.post(`/api/games/tournaments/${id}/start/`);
      await loadTournament(true);
      await loadMeStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start tournament');
    }
  };

  const openEdit = () => {
    if (!tournament) return;
    setEditError('');
    setEditForm({
      name: tournament.name || '',
      description: tournament.description || '',
      type: tournament.type || 'arena',
      time_control: tournament.time_control || 'blitz',
      initial_time_seconds: tournament.initial_time_seconds || 300,
      increment_seconds: tournament.increment_seconds || 0,
      start_at: toLocalInputValue(tournament.start_at),
      arena_duration_minutes: tournament.arena_duration_minutes || 60,
      swiss_rounds: tournament.swiss_rounds || 5,
      rated: tournament.rated,
      password: '',
      clear_password: false
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!id) return;
    setEditLoading(true);
    setEditError('');
    try {
      const payload: any = {
        name: editForm.name,
        description: editForm.description,
        type: editForm.type,
        time_control: editForm.time_control,
        initial_time_seconds: Number(editForm.initial_time_seconds),
        increment_seconds: Number(editForm.increment_seconds),
        start_at: editForm.start_at ? new Date(editForm.start_at).toISOString() : undefined,
        rated: editForm.rated
      };
      if (editForm.type === 'arena') {
        payload.arena_duration_minutes = Number(editForm.arena_duration_minutes);
      }
      if (editForm.type === 'swiss') {
        payload.swiss_rounds = Number(editForm.swiss_rounds);
      }
      if (editForm.clear_password) {
        payload.password = '';
      } else if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }
      await api.patch(`/api/games/tournaments/${id}/`, payload);
      setEditOpen(false);
      setEditForm((prev) => ({ ...prev, password: '', clear_password: false }));
      await loadTournament(true);
    } catch (err: any) {
      setEditError(err.response?.data?.detail || 'Failed to update tournament');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const confirmed = window.confirm('Delete this tournament? This cannot be undone.');
    if (!confirmed) return;
    try {
      await api.delete(`/api/games/tournaments/${id}/`);
      navigate('/tournaments');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete tournament');
    }
  };

  const podium = standings.slice(0, 3);
  const rest = standings.slice(3);
  const standingsPageSize = 25;
  const totalRest = rest.length;
  const totalPages = Math.max(1, Math.ceil(totalRest / standingsPageSize));
  const safePage = Math.min(Math.max(standingsPage, 1), totalPages);
  const pageStart = (safePage - 1) * standingsPageSize;
  const pagedRest = rest.slice(pageStart, pageStart + standingsPageSize);
  const showingStart = totalRest === 0 ? 0 : pageStart + 1;
  const showingEnd = totalRest === 0 ? 0 : Math.min(pageStart + standingsPageSize, totalRest);

  const resolveCountry = (standing: Standing) => {
    return profileCountries[standing.user_id] || standing.country;
  };

  const statChipStyle = {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'rgba(15, 23, 42, 0.6)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 110
  };

  useEffect(() => {
    if (standingsPage !== safePage) {
      setStandingsPage(safePage);
    }
  }, [standingsPage, safePage]);

  useEffect(() => {
    const visible = [...podium, ...pagedRest];
    const missing = visible.filter((row) => !profileCountries[row.user_id]);
    if (!missing.length) return;
    let active = true;
    const load = async () => {
      await Promise.all(
        missing.map(async (row) => {
          try {
            const data = await fetchAccountDetail(row.username);
            if (!active) return;
            setProfileCountries((prev) => ({ ...prev, [row.user_id]: data.country }));
          } catch {
            // ignore missing profiles
          }
        })
      );
    };
    load();
    return () => {
      active = false;
    };
  }, [podium, pagedRest, profileCountries]);


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

  const allowLateRegistration = tournament.type === 'arena' || tournament.type === 'swiss';
  const deadlinePassed = new Date(tournament.start_at) <= new Date();
  const canJoin = tournament.status !== 'completed'
    && (allowLateRegistration
      ? (tournament.status === 'pending' || tournament.status === 'active')
      : (tournament.status === 'pending' && !deadlinePassed));
  const canUnregister = isRegistered
    && (tournament.status === 'pending' || (tournament.status === 'active' && tournament.type !== 'knockout'));
  const timeMinutes = tournament.initial_time_seconds / 60;
  const startDate = new Date(tournament.start_at);
  const statusLabel = tournament.status === 'active' ? 'Live' : tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1);
  const totalRounds = tournament.type === 'swiss'
    ? (tournament.swiss_rounds || 0)
    : tournament.type === 'round_robin'
      ? (tournament.participants_count > 1
        ? (tournament.participants_count % 2 === 0 ? tournament.participants_count - 1 : tournament.participants_count)
        : 0)
      : tournament.type === 'knockout'
        ? (tournament.participants_count > 1 ? Math.ceil(Math.log2(tournament.participants_count)) : 0)
        : 0;
  const currentRound = tournament.current_round || 0;
  const roundLabel = totalRounds ? `Round ${currentRound} of ${totalRounds}` : (currentRound ? `Round ${currentRound}` : '');
  const arenaSecondsLeft = tournament.type === 'arena' && tournament.finished_at
    ? Math.max(0, Math.floor((new Date(tournament.finished_at).getTime() - Date.now()) / 1000))
    : null;
  const waitingForPairing = tournament.status === 'active' && isRegistered && !meStatus?.game_id;
  return (
    <div className="layout stack" style={{ minHeight: 'calc(100vh - 100px)', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', padding: 16, paddingBottom: 20 }}>
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
          <div className="card" style={{ width: 420, maxWidth: '90%' }}>
            <h3 className="card-title" style={{ marginTop: 0 }}>Join Tournament</h3>
            <div className="form-note" style={{ marginBottom: 12 }}>
              This tournament requires an entry code.
            </div>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Entry code"
              style={{ width: '100%', marginBottom: 12 }}
              onKeyPress={(e) => e.key === 'Enter' && doJoin(password)}
              autoFocus
            />
            {joinError && <div className="form-message form-message--error" style={{ marginBottom: 12 }}>{joinError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => doJoin(password)} disabled={joinLoading} style={{ fontSize: 15, padding: '12px 24px', fontWeight: 700 }}>
                {joinLoading ? 'Joining...' : 'Join'}
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

      {/* Edit Tournament Modal */}
      {editOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: 560, maxWidth: '92%', maxHeight: '90%', overflowY: 'auto' }}>
            <h3 className="card-title" style={{ marginTop: 0 }}>Edit Tournament</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Name</div>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => updateEditField('name', e.target.value)}
                />
              </label>
              <label>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Description</div>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => updateEditField('description', e.target.value)}
                />
              </label>
              <div className="grid-2">
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Type</div>
                  <select
                    value={editForm.type}
                    onChange={(e) => updateEditField('type', e.target.value)}
                  >
                    {tournamentTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Time Control</div>
                  <select
                    value={editForm.time_control}
                    onChange={(e) => updateEditField('time_control', e.target.value)}
                  >
                    {timeControls.map((t) => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid-2">
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Time (minutes)</div>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(editForm.initial_time_seconds / 60)}
                    onChange={(e) => updateEditField('initial_time_seconds', Number(e.target.value) * 60)}
                  />
                </label>
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Increment (seconds)</div>
                  <input
                    type="number"
                    min={0}
                    value={editForm.increment_seconds}
                    onChange={(e) => updateEditField('increment_seconds', Number(e.target.value))}
                  />
                </label>
              </div>
              <label>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Start Date/Time</div>
                <input
                  type="datetime-local"
                  value={editForm.start_at}
                  onChange={(e) => updateEditField('start_at', e.target.value)}
                />
              </label>
              {editForm.type === 'arena' && (
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Arena duration (minutes)</div>
                  <input
                    type="number"
                    min={1}
                    value={editForm.arena_duration_minutes}
                    onChange={(e) => updateEditField('arena_duration_minutes', Number(e.target.value))}
                  />
                </label>
              )}
              {editForm.type === 'swiss' && (
                <label>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Swiss rounds</div>
                  <input
                    type="number"
                    min={1}
                    value={editForm.swiss_rounds}
                    onChange={(e) => updateEditField('swiss_rounds', Number(e.target.value))}
                  />
                </label>
              )}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={editForm.rated}
                  onChange={(e) => updateEditField('rated', e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <span>Rated tournament</span>
              </label>
              <label>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Access code</div>
                <input
                  type="text"
                  value={editForm.password}
                  onChange={(e) => updateEditField('password', e.target.value)}
                  placeholder="Leave empty to keep current code"
                  disabled={editForm.clear_password}
                />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={editForm.clear_password}
                  onChange={(e) => updateEditField('clear_password', e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <span>Remove access code</span>
              </label>
              {editError && (
                <div className="form-message form-message--error">{editError}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={editLoading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={editLoading}>
                {editLoading ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {joinError && !passwordPrompt && (
        <div className="form-message form-message--error" style={{ flexShrink: 0 }}>
          {joinError}
        </div>
      )}

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <a href="#/tournaments" className="link-inline">← Tournaments</a>
            <h1 className="page-title" style={{ margin: '4px 0 2px' }}>{tournament.name}</h1>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {tournament.type.charAt(0).toUpperCase() + tournament.type.slice(1).replace('_', ' ')} • {tournament.time_control} • {timeMinutes}+{tournament.increment_seconds} • {tournament.rated ? 'Rated' : 'Unrated'}
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--muted)' }}>
              <span>Start: {startDate.toLocaleString()}</span>
              {tournament.status === 'pending' && secondsUntilStart > 0 && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  Starts in {Math.floor(secondsUntilStart / 60)}m {secondsUntilStart % 60}s
                </span>
              )}
              {tournament.status === 'active' && tournament.started_at && (
                <span>Live since {new Date(tournament.started_at).toLocaleString()}</span>
              )}
              {tournament.status === 'completed' && tournament.finished_at && (
                <span>Finished {new Date(tournament.finished_at).toLocaleString()}</span>
              )}
            </div>
            {waitingForPairing && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                Waiting for your next pairing...
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 220 }}>
          <span className="chip" style={{ fontSize: 13 }}>{statusLabel}</span>
            {canJoin && !isRegistered && (
              <button
              className="btn btn-primary"
                onClick={handleJoin}
                disabled={joinLoading}
                style={{ fontSize: 15, padding: '12px 24px', fontWeight: 700 }}
              >
              {joinLoading ? 'Joining...' : 'Join Tournament'}
              </button>
            )}
            {canUnregister && (
              <button
                className="btn btn-danger"
                onClick={handleUnregister}
                disabled={joinLoading}
                style={{ fontSize: 14, padding: '10px 20px', fontWeight: 700 }}
              >
                {joinLoading ? '⏳ Leaving...' : 'Leave Tournament'}
              </button>
            )}
            {isRegistered && !canUnregister && (
            <div className="chip chip-success">✓ Registered</div>
            )}
            {isCreator && tournament.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-success btn-sm" onClick={handleStart}>
                Start Now
                </button>
              <button className="btn btn-ghost btn-sm" onClick={openEdit}>
                Edit
                </button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <div style={statChipStyle}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Participants</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{tournament.participants_count}</div>
          </div>
          <div style={statChipStyle}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Format</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {tournament.type.replace('_', ' ')} {roundLabel ? `• ${roundLabel}` : ''}
            </div>
          </div>
          <div style={statChipStyle}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {tournament.status === 'pending' ? 'Starts in' : tournament.type === 'arena' && tournament.status === 'active' ? 'Time left' : 'Status'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {tournament.status === 'pending' && secondsUntilStart > 0
                ? `${Math.floor(secondsUntilStart / 60)}m ${secondsUntilStart % 60}s`
                : tournament.type === 'arena' && tournament.status === 'active' && arenaSecondsLeft !== null
                  ? `${Math.floor(arenaSecondsLeft / 60)}m ${arenaSecondsLeft % 60}s`
                  : statusLabel}
            </div>
          </div>
          <div style={statChipStyle}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Access</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {tournament.is_private ? 'Private (code required)' : 'Open'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="card-title">Tournament Info</h3>
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
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Time control</div>
            <div>{tournament.time_control} • {timeMinutes}+{tournament.increment_seconds}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Registration</div>
            <div>
              {allowLateRegistration ? 'Late registration enabled while live.' : 'Registration closes at start time.'}
            </div>
          </div>
          {tournament.type === 'arena' && tournament.arena_duration_minutes && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Arena duration</div>
              <div>{tournament.arena_duration_minutes} minutes</div>
            </div>
          )}
          {tournament.type === 'swiss' && tournament.swiss_rounds && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Swiss rounds</div>
              <div>{tournament.swiss_rounds}</div>
            </div>
          )}
          {tournament.type === 'round_robin' && totalRounds > 0 && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Round-robin rounds</div>
              <div>{totalRounds}</div>
            </div>
          )}
          {tournament.status === 'completed' && tournament.winners && tournament.winners.length > 0 && (
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Winners</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tournament.winners.slice(0, 3).map((winner, idx) => (
                  <div key={winner} style={{ fontWeight: idx === 0 ? 700 : 500 }}>
                    {idx === 0 ? '🏆' : idx === 1 ? '🥈' : '🥉'} {winner}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <h3 className="card-title">Standings</h3>
            {tournament.status === 'completed' && (
              <span className="chip chip-primary">Final</span>
            )}
          </div>
          {podium.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              {podium.map((standing, idx) => (
                <div
                  key={standing.user_id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: idx === 0 ? 'rgba(250, 204, 21, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ fontSize: 20 }}>{idx === 0 ? '🏆' : idx === 1 ? '🥈' : '🥉'}</div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FlagIcon code={resolveCountry(standing)} size={18} />
                    <span>{standing.username}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Score {formatScore(standing.score)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 6 }}>
            {standings.length === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                No standings yet
              </div>
            ) : totalRest === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                Top players listed above
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', position: 'sticky', top: 0, background: 'rgba(11, 18, 32, 0.95)' }}>#</th>
                      <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', position: 'sticky', top: 0, background: 'rgba(11, 18, 32, 0.95)' }}>Player</th>
                      <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(11, 18, 32, 0.95)' }}>Score</th>
                      {tournament.type === 'arena' && (
                        <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(11, 18, 32, 0.95)' }}>Streak</th>
                      )}
                      {tournament.type === 'swiss' && (
                        <>
                          <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(11, 18, 32, 0.95)' }}>Buchholz</th>
                          <th style={{ padding: '8px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'right', position: 'sticky', top: 0, background: 'rgba(11, 18, 32, 0.95)' }}>Med. B.</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRest.map((standing, idx) => {
                      const rank = idx + podium.length + 1 + pageStart;
                      const isMe = standing.user_id === meId;
                      return (
                        <tr key={standing.user_id} style={{ borderBottom: '1px solid var(--border)', background: isMe ? 'rgba(250, 204, 21, 0.08)' : 'transparent' }}>
                          <td style={{ padding: '8px 4px', fontWeight: 600 }}>{rank}</td>
                          <td style={{ padding: '8px 4px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <FlagIcon code={resolveCountry(standing)} size={16} />
                              {standing.username}
                            </span>
                          </td>
                          <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>{formatScore(standing.score)}</td>
                          {tournament.type === 'arena' && (
                            <td style={{ padding: '8px 4px', textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                              {standing.streak ? `W${standing.streak}` : '—'}
                            </td>
                          )}
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
                      );
                    })}
                  </tbody>
                </table>
                {totalRest > standingsPageSize && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                    <div>
                      Showing {showingStart}-{showingEnd} of {totalRest}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="btn btn-ghost"
                        disabled={safePage <= 1}
                        onClick={() => setStandingsPage(safePage - 1)}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        Prev
                      </button>
                      <span style={{ minWidth: 80, textAlign: 'center' }}>
                        Page {safePage} / {totalPages}
                      </span>
                      <button
                        className="btn btn-ghost"
                        disabled={safePage >= totalPages}
                        onClick={() => setStandingsPage(safePage + 1)}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

