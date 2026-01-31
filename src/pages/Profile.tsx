import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { ModeStats, UserDetail } from '../api/types';
import IdentityStrip from '../components/IdentityStrip';
import GameHistory from '../components/GameHistory';
import ModeStatsCharts from '../components/ModeStatsCharts';
import DigiQuizChart from '../components/DigiQuizChart';
import RatingHistoryGraph from '../components/RatingHistoryGraph';
import { socialPlatforms, detectPlatform } from '../utils/socialPlatforms';
import { getFriends, getFriendRequests, respondFriendRequest, sendFriendRequest } from '../api/social';
import { fetchMe } from '../api/account';

export default function Profile() {
  const { username } = useParams();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [friendState, setFriendState] = useState<'checking' | 'none' | 'friends' | 'incoming' | 'outgoing'>('checking');
  const [incomingReqId, setIncomingReqId] = useState<number | null>(null);
  const [me, setMe] = useState<{ id: number; username: string } | null>(null);
  const [friendErr, setFriendErr] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [selectedRatingMode, setSelectedRatingMode] = useState<'bullet' | 'blitz' | 'rapid' | 'classical' | null>(null);

  useEffect(() => {
    if (!username) return;
    api
      .get(`/api/public/accounts/${username}/`)
      .then((r) => {
        console.log('Profile API response:', r.data);
        console.log('DigiQuiz rating from API:', r.data?.digiquiz_rating);
        setUser(r.data);
      })
      .catch(() => {});
  }, [username]);

  useEffect(() => {
    fetchMe().then((u) => setMe({ id: u.id, username: u.username })).catch(() => {});
  }, []);

  const refreshFriendState = () => {
    if (!user) return;
    Promise.all([getFriends(), getFriendRequests()])
      .then(([friends, requests]) => {
        const friendList = (friends as any).results || (Array.isArray(friends) ? friends : []);
        if (friendList.some((f: any) => (f.user ? f.user.id === user.id : f.id === user.id))) {
          setFriendState('friends');
          setIncomingReqId(null);
          return;
        }
        const incoming = requests?.incoming?.find(
          (r: any) => r.from_user?.id === user.id || r.from_id === user.id
        );
        if (incoming) {
          setIncomingReqId(incoming.id);
          setFriendState('incoming');
          return;
        }
        const outgoing = requests?.outgoing?.find(
          (r: any) => r.to_user?.id === user.id || r.to_id === user.id
        );
        if (outgoing) {
          setIncomingReqId(null);
          setFriendState('outgoing');
          return;
        }
        setIncomingReqId(null);
        setFriendState('none');
      })
      .catch(() => {
        setFriendState('none');
        setIncomingReqId(null);
      });
  };

  useEffect(() => {
    refreshFriendState();
  }, [user]);

  const handleFriendAction = () => {
    setFriendErr('');
    if (!user) return;
    if (friendState === 'incoming' && incomingReqId) {
      respondFriendRequest(incomingReqId, 'accept')
        .then(() => {
          setFriendState('friends');
          setIncomingReqId(null);
          refreshFriendState();
        })
        .catch((err) => setFriendErr(err.response?.data?.detail || 'Could not accept request'));
    } else if (friendState === 'none') {
      sendFriendRequest(user.email)
        .then(() => {
          setFriendState('outgoing');
          refreshFriendState();
        })
        .catch((err) => setFriendErr(err.response?.data?.detail || 'Could not send request'));
    }
  };

  const renderFriendButton = () => {
    if (!user || (me && me.id === user.id)) return null;
    // Hide friend request button for bots
    if (user.is_bot) return null;
    if (friendState === 'checking') return <span className="pill">Checking…</span>;
    if (friendState === 'friends') return <span className="pill" style={{ background: '#12345a', color: '#8dd0ff' }}>👥 Friend already</span>;
    if (friendState === 'outgoing') return <span className="pill" style={{ background: '#12345a', color: '#8dd0ff' }}>📨 Request pending</span>;
    if (friendState === 'incoming')
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-success" type="button" onClick={handleFriendAction}>
          ✅ Accept request
        </button>
          <button className="btn btn-danger" type="button" onClick={() => {
            if (!incomingReqId) return;
            respondFriendRequest(incomingReqId, 'decline')
              .then(() => {
                setFriendState('none');
                setIncomingReqId(null);
                refreshFriendState();
              })
              .catch((err) => setFriendErr(err.response?.data?.detail || 'Could not decline request'));
          }}>Decline</button>
        </div>
      );
    return (
      <button className="btn btn-info" type="button" onClick={handleFriendAction}>
        🤝 Send Friend Request
      </button>
    );
  };

  if (!user) {
    return (
      <>
        <div className="layout" style={{ paddingTop: 24, paddingBottom: 24 }}>
          <div className="card" style={{ 
            textAlign: 'center', 
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: 48 }}>⏳</span>
            <h3 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 600, margin: 0 }}>Loading profile...</h3>
          </div>
        </div>
        {friendErr && (
          <div className="card" style={{ 
            color: 'var(--danger)', 
            padding: 16,
            background: 'rgba(239, 83, 80, 0.1)',
            border: '1px solid var(--danger)',
            borderRadius: 8,
            fontSize: 15
          }}>
            ❌ {friendErr}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="layout" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - 100px)', overflow: 'hidden' }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IdentityStrip user={user} rating={user.rating_blitz} />
          {user.stats && (
            <>
              <button
                onClick={() => setShowStats(!showStats)}
                className="btn"
                style={{ 
                  fontSize: 13, 
                  padding: '6px 16px',
                  background: showStats 
                    ? 'linear-gradient(90deg, var(--accent), var(--accent-strong))' 
                    : 'rgba(44, 230, 194, 0.1)',
                  color: showStats ? '#0b0f16' : 'var(--accent)',
                  border: `1px solid ${showStats ? '#1fd6b4' : 'rgba(44, 230, 194, 0.3)'}`,
                  fontWeight: 600,
                  transition: 'all 0.2s ease'
                }}
              >
                {showStats ? 'Hide Stats' : 'Show Stats'}
              </button>
              {showStats && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 8,
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 12,
                  zIndex: 100,
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                  overflow: 'hidden',
                  width: 'max-content',
                  minWidth: '100%',
                  maxWidth: '95vw'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>Stats by Mode</h3>
                    <button
                      onClick={() => setShowStats(false)}
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(5, minmax(160px, 1fr))', 
                    gap: 10,
                    minWidth: '900px'
                  }}>
                    {/* Bullet */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      padding: '12px',
                      background: 'linear-gradient(135deg, rgba(239, 83, 80, 0.1), rgba(239, 83, 80, 0.05))',
                      border: '1px solid rgba(239, 83, 80, 0.2)',
                      borderRadius: 8,
                      minWidth: 180
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#ef5350' }}>
                        ⚡ Bullet
                      </h4>
                      {user.stats.total.modes?.bullet ? (
                        <ModeStatsCharts 
                          stats={user.stats.total.modes.bullet}
                          modeName="Bullet"
                          modeColor="#ef5350"
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 12 }}>
                          No games played
                        </div>
                      )}
                    </div>

                    {/* Blitz */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      padding: '12px',
                      background: 'linear-gradient(135deg, rgba(44, 230, 194, 0.1), rgba(44, 230, 194, 0.05))',
                      border: '1px solid rgba(44, 230, 194, 0.2)',
                      borderRadius: 8,
                      minWidth: 180
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#2ce6c2' }}>
                        🔥 Blitz
                      </h4>
                      {user.stats.total.modes?.blitz ? (
                        <ModeStatsCharts 
                          stats={user.stats.total.modes.blitz}
                          modeName="Blitz"
                          modeColor="#2ce6c2"
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 12 }}>
                          No games played
                        </div>
                      )}
                    </div>

                    {/* Rapid */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      padding: '12px',
                      background: 'linear-gradient(135deg, rgba(123, 198, 255, 0.1), rgba(123, 198, 255, 0.05))',
                      border: '1px solid rgba(123, 198, 255, 0.2)',
                      borderRadius: 8,
                      minWidth: 180
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#7bc6ff' }}>
                        ⏱️ Rapid
                      </h4>
                      {user.stats.total.modes?.rapid ? (
                        <ModeStatsCharts 
                          stats={user.stats.total.modes.rapid}
                          modeName="Rapid"
                          modeColor="#7bc6ff"
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 12 }}>
                          No games played
                        </div>
                      )}
                    </div>

                    {/* Classical */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      padding: '12px',
                      background: 'linear-gradient(135deg, rgba(156, 166, 184, 0.1), rgba(156, 166, 184, 0.05))',
                      border: '1px solid rgba(156, 166, 184, 0.2)',
                      borderRadius: 8,
                      minWidth: 180
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#9ca6b8' }}>
                        📚 Classical
                      </h4>
                      {user.stats.total.modes?.classical ? (
                        <ModeStatsCharts 
                          stats={user.stats.total.modes.classical}
                          modeName="Classical"
                          modeColor="#9ca6b8"
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 12 }}>
                          No games played
                        </div>
                      )}
                    </div>

                    {/* DigiQuiz */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center',
                      padding: '12px',
                      background: 'linear-gradient(135deg, rgba(245, 196, 81, 0.1), rgba(245, 196, 81, 0.05))',
                      border: '1px solid rgba(245, 196, 81, 0.2)',
                      borderRadius: 8,
                      minWidth: 180
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#f5c451' }}>
                        🧩 DigiQuiz
                      </h4>
                      <DigiQuizChart 
                        correct={user.digiquiz_correct || 0}
                        wrong={user.digiquiz_wrong || 0}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {me && me.username === user.username && (
            <Link to="/me" className="btn btn-warning" style={{ fontSize: 13, padding: '6px 16px' }}>
              ✏️ Edit Your Account
            </Link>
          )}
          <span 
            className="pill" 
            style={{
              background: (me && me.id === user.id) || user.is_online || user.is_bot
                ? 'linear-gradient(90deg, #4caf50, #388e3c)' 
                : 'linear-gradient(90deg, #f44336, #d32f2f)',
              color: '#fff',
              border: 'none',
              fontWeight: 600
            }}
          >
            {(me && me.id === user.id) || user.is_online || user.is_bot ? '🟢 Online' : '🔴 Offline'}
          </span>
          {user.is_playing && user.spectate_game_id && (
            <a className="btn btn-info" href={`#/games/${user.spectate_game_id}`}>👁️ Spectate</a>
          )}
          {renderFriendButton()}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '0 0 300px', overflow: 'hidden' }}>
          <div className="card" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={{ 
              marginTop: 0, 
              marginBottom: 16, 
              flexShrink: 0,
              fontSize: 18,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>📊</span>
              <span>Ratings</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden' }}>
              <div 
                onClick={() => {
                  console.log('[Profile] Clicked bullet rating, setting mode');
                  if (user.rating_bullet) {
                    setSelectedRatingMode('bullet');
                  }
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, rgba(239, 83, 80, 0.1), rgba(239, 83, 80, 0.05))',
                  border: '1px solid rgba(239, 83, 80, 0.2)',
                  borderRadius: 8,
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  cursor: user.rating_bullet ? 'pointer' : 'default'
                }}
                onMouseEnter={(e) => {
                  if (user.rating_bullet) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 83, 80, 0.2), rgba(239, 83, 80, 0.1))';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (user.rating_bullet) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 83, 80, 0.1), rgba(239, 83, 80, 0.05))';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: 6, 
                    background: 'linear-gradient(135deg, #ef5350, #d32f2f)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0
                  }}>⚡</div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Bullet</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#ef5350' }}>
                      {user.rating_bullet || '—'}
                    </div>
                  </div>
                </div>
                {user.rating_bullet && <span style={{ fontSize: 12, color: 'var(--muted)' }}>📈</span>}
              </div>
              
              <div 
                onClick={() => user.rating_blitz && setSelectedRatingMode('blitz')}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, rgba(44, 230, 194, 0.1), rgba(44, 230, 194, 0.05))',
                  border: '1px solid rgba(44, 230, 194, 0.2)',
                  borderRadius: 8,
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  cursor: user.rating_blitz ? 'pointer' : 'default'
                }}
                onMouseEnter={(e) => {
                  if (user.rating_blitz) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(44, 230, 194, 0.2), rgba(44, 230, 194, 0.1))';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (user.rating_blitz) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(44, 230, 194, 0.1), rgba(44, 230, 194, 0.05))';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: 6, 
                    background: 'linear-gradient(135deg, #2ce6c2, #15a374)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0
                  }}>🔥</div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Blitz</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#2ce6c2' }}>
                      {user.rating_blitz || '—'}
                    </div>
                  </div>
                </div>
                {user.rating_blitz && <span style={{ fontSize: 12, color: 'var(--muted)' }}>📈</span>}
              </div>
              
              <div 
                onClick={() => user.rating_rapid && setSelectedRatingMode('rapid')}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, rgba(123, 198, 255, 0.1), rgba(123, 198, 255, 0.05))',
                  border: '1px solid rgba(123, 198, 255, 0.2)',
                  borderRadius: 8,
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  cursor: user.rating_rapid ? 'pointer' : 'default'
                }}
                onMouseEnter={(e) => {
                  if (user.rating_rapid) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(123, 198, 255, 0.2), rgba(123, 198, 255, 0.1))';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (user.rating_rapid) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(123, 198, 255, 0.1), rgba(123, 198, 255, 0.05))';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: 6, 
                    background: 'linear-gradient(135deg, #7bc6ff, #4a90e2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0
                  }}>⏱️</div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Rapid</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#7bc6ff' }}>
                      {user.rating_rapid || '—'}
                    </div>
                  </div>
                </div>
                {user.rating_rapid && <span style={{ fontSize: 12, color: 'var(--muted)' }}>📈</span>}
              </div>
              
              <div 
                onClick={() => user.rating_classical && setSelectedRatingMode('classical')}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, rgba(156, 166, 184, 0.1), rgba(156, 166, 184, 0.05))',
                  border: '1px solid rgba(156, 166, 184, 0.2)',
                  borderRadius: 8,
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  cursor: user.rating_classical ? 'pointer' : 'default'
                }}
                onMouseEnter={(e) => {
                  if (user.rating_classical) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(156, 166, 184, 0.2), rgba(156, 166, 184, 0.1))';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (user.rating_classical) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(156, 166, 184, 0.1), rgba(156, 166, 184, 0.05))';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: 6, 
                    background: 'linear-gradient(135deg, #9ca6b8, #6b7280)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0
                  }}>📚</div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Classical</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#9ca6b8' }}>
                      {user.rating_classical || '—'}
                    </div>
                  </div>
                </div>
                {user.rating_classical && <span style={{ fontSize: 12, color: 'var(--muted)' }}>📈</span>}
              </div>
              
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'linear-gradient(135deg, rgba(245, 196, 81, 0.1), rgba(245, 196, 81, 0.05))',
                border: '1px solid rgba(245, 196, 81, 0.2)',
                borderRadius: 8,
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: 6, 
                    background: 'linear-gradient(135deg, #f5c451, #d4a017)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0
                  }}>🧩</div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>DigiQuiz</div>
                    <div style={{ 
                      fontSize: 18, 
                      fontWeight: 700, 
                      color: '#f5c451'
                    }}>
                      {(() => {
                        // Backend sends rating_digiquiz, but TypeScript interface uses digiquiz_rating
                        const rating = (user as any).rating_digiquiz ?? user.digiquiz_rating;
                        return (rating !== undefined && rating !== null && rating !== '')
                          ? String(rating)
                          : '—';
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card" style={{ flex: '0 0 auto', flexShrink: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>About</h3>
            <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '1.4', marginBottom: 8 }}>
              {user.bio || 'No bio yet.'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {user.social_links?.map((s) => {
                const platform = detectPlatform(s.url || '') || s.label || 'Custom';
                const icon = socialPlatforms.find((p) => p.name === platform)?.icon;
                return (
                  <a key={s.url} className="pill" href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, padding: '4px 8px' }}>
                    {icon ? (
                      <img src={icon} alt={platform} style={{ width: 14, height: 14 }} />
                    ) : (
                      <span>{platform.slice(0, 2)}</span>
                    )}
                  </a>
                );
              })}
              {(!user.social_links || user.social_links.length === 0) && <span style={{ color: 'var(--muted)', fontSize: 12 }}>No socials.</span>}
            </div>
          </div>
        </div>
        {/* Game History - Takes remaining space */}
        <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {user?.username && <GameHistory username={user.username} currentUserId={me?.id} />}
        </div>
      </div>
      {selectedRatingMode && user && (
        <RatingHistoryGraph
          username={user.username}
          mode={selectedRatingMode}
          onClose={() => setSelectedRatingMode(null)}
        />
      )}
    </div>
  );
}

function StatsRow({ label, stats }: { label: string; stats: ModeStats }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{stats.games_played}</td>
      <td>{stats.wins}</td>
      <td>{stats.draws}</td>
      <td>{stats.win_percentage}%</td>
      <td>{stats.win_percentage_white}%</td>
      <td>{stats.win_percentage_black}%</td>
    </tr>
  );
}

function StatsGrid({ total }: { total: any }) {
  const modes = total?.modes || {};
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Mode</th>
          <th>Played</th>
          <th>Wins</th>
          <th>Draws</th>
          <th>Win%</th>
          <th>Win% White</th>
          <th>Win% Black</th>
        </tr>
      </thead>
      <tbody>
        <StatsRow label="Total" stats={total} />
        {modes.bullet && <StatsRow label="Bullet" stats={modes.bullet} />}
        {modes.blitz && <StatsRow label="Blitz" stats={modes.blitz} />}
        {modes.rapid && <StatsRow label="Rapid" stats={modes.rapid} />}
        {modes.classical && <StatsRow label="Classical" stats={modes.classical} />}
        {modes.custom && <StatsRow label="Custom" stats={modes.custom} />}
      </tbody>
    </table>
  );
}
