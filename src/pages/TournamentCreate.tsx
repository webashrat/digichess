import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Mode } from '../api/types';

const tournamentTypes = [
  { value: 'knockout', label: 'Knockout' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'arena', label: 'Arena' },
  { value: 'swiss', label: 'Swiss' }
];

const timeControls: Mode[] = ['bullet', 'blitz', 'rapid', 'classical', 'custom'];

export default function TournamentCreate() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'arena',
    time_control: 'blitz' as Mode,
    initial_time_seconds: 300,
    increment_seconds: 2,
    start_at: '',
    wait_minutes: 5,
    arena_duration_minutes: 60,
    swiss_rounds: 5,
    rated: true,
    password: ''
  });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getTimeRange = (mode: Mode) => {
    switch (mode) {
      case 'bullet':
        return { min: 1, max: 3 };
      case 'blitz':
        return { min: 3, max: 10 };
      case 'rapid':
        return { min: 10, max: 25 };
      case 'classical':
        return { min: 25, max: 120 };
      case 'custom':
      default:
        return { min: 1, max: 120 };
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');

    // Calculate start_at from wait_minutes
    const startDate = formData.start_at 
      ? new Date(formData.start_at)
      : new Date(Date.now() + formData.wait_minutes * 60 * 1000);

    const payload: any = {
      name: formData.name,
      description: formData.description,
      type: formData.type,
      time_control: formData.time_control,
      initial_time_seconds: formData.initial_time_seconds,
      increment_seconds: formData.increment_seconds,
      start_at: startDate.toISOString(),
      rated: formData.rated
    };

    if (formData.type === 'arena') {
      payload.arena_duration_minutes = formData.arena_duration_minutes;
    }
    if (formData.type === 'swiss') {
      payload.swiss_rounds = formData.swiss_rounds;
    }
    if (formData.password) {
      payload.password = formData.password;
    }

    api
      .post('/api/games/tournaments/', payload)
      .then((res) => {
        setMsg('Tournament created successfully!');
        setTimeout(() => {
          navigate('/tournaments');
        }, 1500);
      })
      .catch((err) => {
        const responseData = err.response?.data;
        let errorMsg = 'Failed to create tournament';
        
        if (responseData) {
          if (responseData.detail) {
            if (typeof responseData.detail === 'string') {
              errorMsg = responseData.detail;
            } else if (Array.isArray(responseData.detail)) {
              errorMsg = responseData.detail.join(', ');
            } else {
              errorMsg = String(responseData.detail);
            }
          }
          else if (responseData.error) {
            errorMsg = typeof responseData.error === 'string' ? responseData.error : String(responseData.error);
          }
          else if (responseData.message) {
            errorMsg = typeof responseData.message === 'string' ? responseData.message : String(responseData.message);
          }
          else if (responseData.non_field_errors) {
            const errors = Array.isArray(responseData.non_field_errors) 
              ? responseData.non_field_errors 
              : [responseData.non_field_errors];
            errorMsg = errors.join(', ');
          }
          else if (typeof responseData === 'string') {
            errorMsg = responseData;
          }
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

  const { min, max } = getTimeRange(formData.time_control);
  const timeMinutes = formData.initial_time_seconds / 60;

  return (
    <div className="layout" style={{ display: 'flex', justifyContent: 'center', height: 'calc(100vh - 100px)', overflow: 'hidden' }}>
      <form 
        className="card" 
        style={{ width: 600, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', maxHeight: '100%' }} 
        onSubmit={submit}
      >
        <h2 style={{ margin: 0 }}>Create Tournament</h2>

        {/* Tournament Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Tournament</h3>
          
          <label>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Name *</div>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
              placeholder="Tournament name"
            />
          </label>

          <label>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <textarea
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              placeholder="Optional description"
            />
          </label>

          <label>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Type *</div>
            <select
              value={formData.type}
              onChange={(e) => updateField('type', e.target.value)}
              required
            >
              {tournamentTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Game Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Games</h3>
          
          <label>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Time Control *</div>
            <select
              value={formData.time_control}
              onChange={(e) => {
                const mode = e.target.value as Mode;
                updateField('time_control', mode);
                const range = getTimeRange(mode);
                updateField('initial_time_seconds', range.min * 60);
              }}
              required
            >
              {timeControls.map(m => (
                <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
          </label>

          <div className="grid-2">
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Time (minutes) *</div>
              <input
                type="range"
                min={min}
                max={max}
                value={timeMinutes}
                onChange={(e) => updateField('initial_time_seconds', Number(e.target.value) * 60)}
                required
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{timeMinutes} min</div>
            </label>

            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Increment (seconds) *</div>
              <input
                type="range"
                min={0}
                max={60}
                value={formData.increment_seconds}
                onChange={(e) => updateField('increment_seconds', Number(e.target.value))}
                required
              />
              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{formData.increment_seconds} s</div>
            </label>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={formData.rated}
              onChange={(e) => updateField('rated', e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Rated tournament</span>
          </label>
        </div>

        {/* Start Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Start</h3>
          
          <label>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Start Date/Time</div>
            <input
              type="datetime-local"
              value={formData.start_at}
              onChange={(e) => updateField('start_at', e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              Leave empty to start in {formData.wait_minutes} minutes
            </div>
          </label>

          <label>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Wait Minutes (if no start date)</div>
            <select
              value={formData.wait_minutes}
              onChange={(e) => updateField('wait_minutes', Number(e.target.value))}
            >
              {[1, 2, 3, 5, 10, 15, 20, 30, 45, 60].map(m => (
                <option key={m} value={m}>{m} minute{m !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Type-specific Settings */}
        {formData.type === 'arena' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Arena Settings</h3>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Duration (minutes) *</div>
              <input
                type="number"
                min={1}
                max={720}
                value={formData.arena_duration_minutes}
                onChange={(e) => updateField('arena_duration_minutes', Number(e.target.value))}
                required
              />
            </label>
          </div>
        )}

        {formData.type === 'swiss' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Swiss Settings</h3>
            <label>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Number of Rounds *</div>
              <input
                type="number"
                min={1}
                max={20}
                value={formData.swiss_rounds}
                onChange={(e) => updateField('swiss_rounds', Number(e.target.value))}
                required
              />
            </label>
          </div>
        )}

        {/* Optional Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--muted)' }}>Optional</h3>
          <label>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Password (Entry Code)</div>
            <input
              type="text"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder="Leave empty for public tournament"
            />
          </label>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}
        {msg && <div style={{ color: 'var(--accent)', fontSize: 14 }}>{msg}</div>}
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-gold" type="submit" style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>🏆 Create Tournament</button>
          <button 
            className="btn btn-ghost" 
            type="button" 
            onClick={() => navigate('/tournaments')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}




