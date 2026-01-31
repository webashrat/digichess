import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { GameSummary, LeaderboardRow, Mode } from '../api/types';
import IdentityStrip from '../components/IdentityStrip';
import FlagIcon from '../components/FlagIcon';
import { AccountListItem } from '../api/types';
import { fetchMe } from '../api/account';
import { fetchAccountDetail } from '../api/users';
import { listBots, createBotGame } from '../api/games';

const defaultModes: Mode[] = ['bullet', 'blitz', 'rapid', 'classical'];

interface GameHistoryItem extends GameSummary {
  created_at?: string;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('blitz');
  const [live, setLive] = useState<GameSummary[]>([]);
  const [leaders, setLeaders] = useState<LeaderboardRow[]>([]);
  const [mmStatus, setMmStatus] = useState('');
  const [queueing, setQueueing] = useState(false);
  const [online, setOnline] = useState<AccountListItem[]>([]);
  const [activeGameId, setActiveGameId] = useState<number | null>(null);
  const [challengingId, setChallengingId] = useState<number | null>(null);
  const [myGames, setMyGames] = useState<GameHistoryItem[]>([]);
  const [myGamesPage, setMyGamesPage] = useState(1);
  const [myGamesTotal, setMyGamesTotal] = useState(0);
  const [myGamesLoading, setMyGamesLoading] = useState(false);
  const [includeBotGames, setIncludeBotGames] = useState(true); // Filter for bot games
  
  // Reset page when filter changes
  useEffect(() => {
    setMyGamesPage(1);
  }, [includeBotGames]);
  const [me, setMe] = useState<{ id: number; username: string } | null>(null);
  const [showBotsDropdown, setShowBotsDropdown] = useState(false);
  const [bots, setBots] = useState<any[]>([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get('/api/games/public/', { params: { status: 'active', page_size: 6 } })
      .then((r) => setLive(r.data?.results || r.data || []))
      .catch(() => {});
    api
      .get('/api/games/leaderboard/ratings/', { params: { mode: 'blitz', page_size: 5 } })
      .then((r) => {
        // Filter out bots from leaderboard
        const filtered = (r.data?.results || []).filter((item: any) => !item.is_bot);
        setLeaders(filtered);
      })
      .catch(() => {});
    api
      .get('/api/public/accounts/', { params: { page_size: 50 } })
      .then((r) => {
        const items = r.data?.results || [];
        setOnline(items.filter((u: any) => u.is_online && !u.is_bot));
      })
      .catch(() => {});
    
    // Load current user
    fetchMe()
      .then((u) => {
        setMe({ id: u.id, username: u.username });
      })
      .catch(() => {});
    
    // Load bots
    loadBots();
    
    // Setup presence ping - ping every 60 seconds to keep user online
    const pingInterval = setInterval(() => {
      if (localStorage.getItem('token')) {
        api.post('/api/accounts/ping/').catch(() => {});
      }
    }, 60000); // Ping every 60 seconds
    
    // Ping immediately on mount
    if (localStorage.getItem('token')) {
      api.post('/api/accounts/ping/').catch(() => {});
    }
    
    return () => clearInterval(pingInterval);
  }, [mode]);
  
  const loadBots = async () => {
    setBotsLoading(true);
    try {
      const data = await listBots(mode);
      setBots(data.bots || []);
    } catch (err) {
      console.error('Failed to load bots:', err);
    } finally {
      setBotsLoading(false);
    }
  };
  
  const handlePlayBot = async (bot: any) => {
    if (!me) {
      alert('Please login to play with bots');
      return;
    }
    
    try {
      const game = await createBotGame(bot.id, mode, 'auto', false);
      navigate(`/games/${game.id}`);
      setShowBotsDropdown(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create bot game');
    }
  };

  const challengePlayer = async (userId: number) => {
    if (!localStorage.getItem('token')) {
      alert('Please login to challenge players');
      return;
    }
    setChallengingId(userId);
    try {
      const { data } = await api.post('/api/games/', {
        opponent_id: userId,
        preferred_color: 'auto',
        time_control: mode,
        rated: true
      });
      const id = data?.id;
      if (id) {
        navigate(`/games/${id}`);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || 'Failed to challenge player';
      alert(errorMsg);
    } finally {
      setChallengingId(null);
    }
  };

  useEffect(() => {
    if (me?.username) {
      loadMyGames();
    }
  }, [me?.username, myGamesPage]);

  useEffect(() => {
    if (!me?.username) {
      setActiveGameId(null);
      return;
    }
    let mounted = true;
    const loadActiveGame = async () => {
      try {
        const detail = await fetchAccountDetail(me.username);
        if (!mounted) return;
        if (detail.is_playing && detail.spectate_game_id) {
          setActiveGameId(detail.spectate_game_id);
        } else {
          setActiveGameId(null);
        }
      } catch {
        if (mounted) setActiveGameId(null);
      }
    };
    loadActiveGame();
    const interval = window.setInterval(loadActiveGame, 30000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [me?.username]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showBotsDropdown && !target.closest('[data-bots-dropdown]')) {
        setShowBotsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBotsDropdown]);

  const loadMyGames = async () => {
    if (!me?.username) return;
    
    setMyGamesLoading(true);
    try {
      const { data } = await api.get(`/api/games/user/${me.username}/`, {
        params: {
          page: myGamesPage,
          page_size: 2,
          status: 'finished',
          sort: '-created_at'
        }
      });
      setMyGames(data?.results || []);
      setMyGamesTotal(data?.total || 0);
    } catch (err) {
      console.error('Failed to load my games:', err);
    } finally {
      setMyGamesLoading(false);
    }
  };

  const getResultForUser = (game: GameHistoryItem): string => {
    if (!game.result || game.result === '*') return '-';
    if (!me) return '-';
    
    const isWhite = game.white.id === me.id;
    if (game.result === '1-0') return isWhite ? 'W' : 'L';
    if (game.result === '0-1') return isWhite ? 'L' : 'W';
    if (game.result === '1/2-1/2') return 'D';
    return '-';
  };

  const getResultClass = (result: string) => {
    if (result === 'W') return { color: 'var(--accent)', fontWeight: 600 };
    if (result === 'L') return { color: 'var(--danger)' };
    if (result === 'D') return { color: 'var(--muted)' };
    return {};
  };

  const findMatch = () => {
    setQueueing(true);
    setMmStatus('Searching...');
    api
      .post('/api/games/matchmaking/enqueue/', { time_control: mode, rated: true })
      .then((res) => {
        if (res.data?.id) {
          setMmStatus('Match found, opening game...');
          window.location.href = `/games/${res.data.id}`;
        } else {
          setMmStatus('Enqueued. Waiting for opponent...');
        }
      })
      .catch((err) => {
        setMmStatus(err.response?.data?.detail || 'Matchmaking failed (login required?)');
        setQueueing(false);
      });
  };

  const cancelMatch = () => {
    setMmStatus('Cancelling...');
    api
      .post('/api/games/matchmaking/cancel/', { time_control: mode })
      .then(() => {
        setMmStatus('Cancelled.');
        setQueueing(false);
      })
      .catch(() => {
        setMmStatus('Cancel failed.');
        setQueueing(false);
      });
  };

  const visibleOnline = online.filter((u) => (me ? u.id !== me.id : true));

  return (
    <div className="layout" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 20, paddingBottom: 20, width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {activeGameId && (
        <div
          className="card"
          style={{
            border: '1px solid rgba(245, 196, 81, 0.4)',
            background: 'linear-gradient(120deg, rgba(245, 196, 81, 0.18) 0%, rgba(44, 230, 194, 0.08) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 18px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#f5c451' }}>♟️ Live game in progress</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              You have an active game. Resume from where you left off.
            </div>
          </div>
          <button
            className="btn btn-gold"
            type="button"
            onClick={() => navigate(`/games/${activeGameId}`)}
            style={{ fontSize: 13, padding: '10px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            Resume Game →
          </button>
        </div>
      )}
      {/* Hero Section */}
      <div className="card" style={{ 
        background: 'linear-gradient(135deg, rgba(44, 230, 194, 0.1) 0%, rgba(21, 163, 116, 0.05) 100%)',
        border: '1px solid rgba(44, 230, 194, 0.2)',
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 16, 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        flexShrink: 0,
        padding: 24
      }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            marginBottom: 8,
            color: 'var(--accent)',
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1
          }}>
            <span>⚡</span>
            <span>Quick Play</span>
          </div>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 800, 
            margin: 0,
            marginBottom: 4,
            color: (() => {
              const modeColorMap: Record<Mode, string> = {
                bullet: '#ff6b6b',
                blitz: '#9b59b6',
                rapid: '#45b7d1',
                classical: '#f5c451'
              };
              return modeColorMap[mode];
            })(),
            textTransform: 'capitalize'
          }}>
            Start a {mode} match
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Find an opponent and start playing instantly
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {defaultModes.map((m) => {
            // Define colors for each time control
            const modeColors: Record<Mode, { active: string; inactive: string; bg: string; border: string }> = {
              bullet: {
                active: '#ff6b6b',
                inactive: '#ff6b6b80',
                bg: 'rgba(255, 107, 107, 0.15)',
                border: 'rgba(255, 107, 107, 0.4)'
              },
              blitz: {
                active: '#9b59b6',
                inactive: '#9b59b680',
                bg: 'rgba(155, 89, 182, 0.15)',
                border: 'rgba(155, 89, 182, 0.4)'
              },
              rapid: {
                active: '#45b7d1',
                inactive: '#45b7d180',
                bg: 'rgba(69, 183, 209, 0.15)',
                border: 'rgba(69, 183, 209, 0.4)'
              },
              classical: {
                active: '#f5c451',
                inactive: '#f5c45180',
                bg: 'rgba(245, 196, 81, 0.15)',
                border: 'rgba(245, 196, 81, 0.4)'
              }
            };
            
            const colors = modeColors[m];
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
                  transition: 'all 0.2s ease',
                  textTransform: 'capitalize'
                }}
                onClick={() => setMode(m)}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = colors.border;
                    e.currentTarget.style.background = colors.bg;
                    e.currentTarget.style.color = colors.active;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = colors.inactive;
                  }
                }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            type="button" 
            onClick={findMatch} 
            disabled={queueing}
            style={{
              fontSize: 15,
              padding: '12px 24px',
              fontWeight: 700,
              boxShadow: queueing ? 'none' : '0 4px 12px rgba(44, 230, 194, 0.3)'
            }}
          >
            {queueing ? '⏳ Searching...' : '⚡ Find Match'}
          </button>
          {queueing && (
            <button className="btn btn-warning" type="button" onClick={cancelMatch} style={{ fontSize: 13 }}>
              Cancel
            </button>
          )}
          {mmStatus && (
            <div style={{ 
              color: 'var(--accent)', 
              fontSize: 13, 
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              background: 'rgba(44, 230, 194, 0.1)',
              borderRadius: 8,
              border: '1px solid rgba(44, 230, 194, 0.2)'
            }}>
              <span>💬</span>
              <span>{mmStatus}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: 16, 
            flexShrink: 0,
            gap: 12,
            flexWrap: 'wrap'
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: 18, 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10,
              color: 'var(--text)'
            }}>
              <span style={{ fontSize: 20 }}>👥</span>
              <span>Online Players</span>
            </h3>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10,
              flexWrap: 'wrap'
            }}>
              <div style={{ position: 'relative' }} data-bots-dropdown>
                <button
                  onClick={() => setShowBotsDropdown(!showBotsDropdown)}
                  style={{
                    fontSize: 13,
                    padding: '10px 18px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'linear-gradient(135deg, #9b59b6, #8e44ad)',
                    color: '#ffffff',
                    border: '1px solid #ba68c8',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(155, 89, 182, 0.3)',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #ba68c8, #9b59b6)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(155, 89, 182, 0.4)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #9b59b6, #8e44ad)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(155, 89, 182, 0.3)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span style={{ fontSize: 16 }}>🤖</span>
                  <span>Play with Bots</span>
                  <span style={{ fontSize: 10, marginLeft: 2 }}>{showBotsDropdown ? '▲' : '▼'}</span>
                </button>
                {showBotsDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 10,
                    background: 'linear-gradient(160deg, rgba(22, 32, 54, 0.98), rgba(12, 18, 32, 0.98))',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(155, 89, 182, 0.1)',
                    zIndex: 1000,
                    minWidth: 320,
                    maxWidth: 'min(400px, calc(100vw - 48px))',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: 16,
                    animation: 'fadeIn 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  className="bots-dropdown-scroll"
                  ref={(el) => {
                    if (el && el.parentElement) {
                      // Get button and dropdown positions
                      const buttonRect = el.parentElement.getBoundingClientRect();
                      const dropdownWidth = el.offsetWidth || 320;
                      const viewportWidth = window.innerWidth;
                      
                      // Calculate if dropdown would overflow on the right
                      const rightEdge = buttonRect.left + dropdownWidth;
                      if (rightEdge > viewportWidth - 24) {
                        // Align to right edge of button, but ensure it doesn't go off screen
                        el.style.left = 'auto';
                        el.style.right = '0';
                        // If still too wide, adjust max width
                        if (buttonRect.right > viewportWidth - 24) {
                          el.style.maxWidth = `${viewportWidth - buttonRect.right - 24}px`;
                        }
                      } else {
                        // Default: align to left edge of button
                        el.style.left = '0';
                        el.style.right = 'auto';
                      }
                    }
                  }}
                  >
                    <style>{`
                      @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(-8px); }
                        to { opacity: 1; transform: translateY(0); }
                      }
                    `}</style>
                    <style>{`
                      /* Custom scrollbar for bot dropdown - scoped to this dropdown */
                      .bots-dropdown-scroll::-webkit-scrollbar {
                        width: 8px;
                      }
                      .bots-dropdown-scroll::-webkit-scrollbar-track {
                        background: rgba(26, 34, 51, 0.5);
                        border-radius: 4px;
                        margin: 4px 0;
                      }
                      .bots-dropdown-scroll::-webkit-scrollbar-thumb {
                        background: rgba(155, 89, 182, 0.5);
                        border-radius: 4px;
                        border: 1px solid rgba(155, 89, 182, 0.2);
                      }
                      .bots-dropdown-scroll::-webkit-scrollbar-thumb:hover {
                        background: rgba(155, 89, 182, 0.7);
                      }
                      /* Firefox scrollbar */
                      .bots-dropdown-scroll {
                        scrollbar-width: thin;
                        scrollbar-color: rgba(155, 89, 182, 0.5) rgba(26, 34, 51, 0.5);
                      }
                    `}</style>
                    <div style={{ 
                      fontSize: 15, 
                      fontWeight: 700, 
                      marginBottom: 16, 
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      paddingBottom: 12,
                      borderBottom: '1px solid var(--border)'
                    }}>
                      <span style={{ fontSize: 18 }}>🤖</span>
                      <span>Select a Bot to Play</span>
                    </div>
                    {botsLoading ? (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                        Loading bots...
                      </div>
                    ) : bots.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                        No bots available
                      </div>
                    ) : (
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: 8
                      }}>
                        {bots.map((bot) => (
                          <button
                            key={bot.id}
                            onClick={() => handlePlayBot(bot)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '14px 16px',
                              background: 'rgba(44, 230, 194, 0.03)',
                              border: '1px solid var(--border)',
                              borderRadius: 10,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              textAlign: 'left',
                              width: '100%'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(155, 89, 182, 0.15)';
                              e.currentTarget.style.borderColor = 'rgba(155, 89, 182, 0.4)';
                              e.currentTarget.style.transform = 'translateX(-3px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(155, 89, 182, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(44, 230, 194, 0.03)';
                              e.currentTarget.style.borderColor = 'var(--border)';
                              e.currentTarget.style.transform = 'translateX(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <div style={{
                              fontSize: 32,
                              width: 48,
                              height: 48,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: (bot.first_name === 'DIGI' || bot.username === 'DIGI') 
                                ? 'transparent' 
                                : 'rgba(44, 230, 194, 0.1)',
                              borderRadius: 8,
                              flexShrink: 0,
                              overflow: 'hidden',
                              backgroundImage: (bot.first_name === 'DIGI' || bot.username === 'DIGI') 
                                ? 'url(/DIGIBOT.jpg)' 
                                : undefined,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center'
                            }}>
                              {(bot.first_name !== 'DIGI' && bot.username !== 'DIGI') && (bot.bot_avatar || '🤖')}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                fontSize: 15, 
                                fontWeight: 700, 
                                color: 'var(--text)',
                                marginBottom: 2
                              }}>
                                {bot.first_name || bot.username}
                              </div>
                              <div style={{ 
                                fontSize: 12, 
                                color: 'var(--muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                              }}>
                                <span>Rating: <strong style={{ color: 'var(--accent)' }}>{bot.rating}</strong></span>
                              </div>
                            </div>
                            <div style={{
                              fontSize: 20,
                              color: 'var(--accent)',
                              flexShrink: 0
                            }}>
                              →
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <a 
                href="/players" 
                style={{ 
                  fontSize: 13, 
                  padding: '10px 18px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'linear-gradient(135deg, #4a90e2, #357abd)',
                  color: '#ffffff',
                  border: '1px solid #5ba0f2',
                  borderRadius: 10,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(74, 144, 226, 0.3)',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #5ba0f2, #4a90e2)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(74, 144, 226, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #4a90e2, #357abd)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 144, 226, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span>View all</span>
                <span style={{ fontSize: 12 }}>→</span>
              </a>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            {visibleOnline.slice(0, 4).map((u) => (
              <div 
                key={u.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  border: '1px solid var(--border)', 
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: 'rgba(44, 230, 194, 0.03)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(44, 230, 194, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(44, 230, 194, 0.3)';
                  e.currentTarget.style.transform = 'translateX(2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(44, 230, 194, 0.03)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
                onClick={() => window.location.href = `/profile/${u.username}`}
              >
                <IdentityStrip user={u as any} />
                <button
                  className="btn btn-info"
                  type="button"
                  disabled={challengingId === u.id}
                  style={{ fontSize: 11, padding: '6px 10px', fontWeight: 600 }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    challengePlayer(u.id);
                  }}
                >
                  {challengingId === u.id ? 'Sending...' : '⚔️ Challenge'}
                </button>
              </div>
            ))}
            {visibleOnline.length === 0 && (
              <div style={{ 
                color: 'var(--muted)', 
                fontSize: 14, 
                textAlign: 'center',
                padding: '40px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(44, 230, 194, 0.02)',
                borderRadius: 12,
                border: '1px dashed var(--border)'
              }}>
                <span style={{ fontSize: 48, filter: 'drop-shadow(0 0 10px rgba(255, 235, 59, 0.3))' }}>🌙</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>No one online right now</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Check back later or invite friends to play!</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🔥</span>
              <span>Live Games</span>
            </h3>
              <a 
                href="/games" 
                className="btn btn-info"
                style={{ 
                  fontSize: 13, 
                  padding: '8px 16px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                View all →
              </a>
          </div>
          {live.length === 0 && (
            <div style={{ 
              color: 'var(--muted)', 
              fontSize: 13, 
              textAlign: 'center',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ fontSize: 32 }}>🎲</span>
              <span>No live games right now</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {live.slice(0, 3).map((g) => (
              <div key={g.id} className="card" style={{ 
                padding: 12,
                border: '1px solid rgba(44, 230, 194, 0.1)',
                background: 'linear-gradient(135deg, rgba(44, 230, 194, 0.05) 0%, transparent 100%)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(44, 230, 194, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(44, 230, 194, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              onClick={() => window.location.href = `/games/${g.id}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <IdentityStrip user={g.white} rating={undefined} mode={g.mode} />
                  <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>VS</span>
                  <IdentityStrip user={g.black} rating={undefined} mode={g.mode} />
                </div>
                {g && (
                  <div style={{ 
                    color: 'var(--muted)', 
                    fontSize: 12, 
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span>⏱️ {g.time_control}</span>
                    <span>👁️ {g.spectators ?? 0}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <a
                    className="btn"
                    style={{
                      fontSize: 12,
                      padding: '6px 14px',
                      fontWeight: 600,
                      background:
                        me && (g.white.id === me.id || g.black.id === me.id)
                          ? 'linear-gradient(90deg, #4caf50, #388e3c)'
                          : 'linear-gradient(90deg, #2196f3, #1976d2)',
                      color: '#ffffff',
                      border:
                        me && (g.white.id === me.id || g.black.id === me.id)
                          ? '1px solid #66bb6a'
                          : '1px solid #64b5f6'
                    }}
                    href={`/games/${g.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {me && (g.white.id === me.id || g.black.id === me.id) ? '▶️ Play' : '👀 Watch'}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏆</span>
              <span>Leaderboards</span>
            </h3>
              <a 
                href="/leaderboards" 
                className="btn btn-info"
                style={{ 
                  fontSize: 13, 
                  padding: '8px 16px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                Full board →
              </a>
          </div>
          <table className="table" style={{ fontSize: 14, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Rank</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Player</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {leaders.slice(0, 4).map((row, idx) => (
                <tr key={row.username} style={{ 
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
                    padding: '10px 12px', 
                    fontSize: 14, 
                    fontWeight: idx < 3 ? 700 : 600,
                    color: idx === 0 ? '#f5c451' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : 'var(--text)'
                  }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </td>
                  <td style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    padding: '10px 12px',
                    fontSize: 14
                  }}>
                    <FlagIcon code={row.country} size={18} />
                    <a 
                      href={`/profile/${row.username}`} 
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
                      {row.username}
                    </a>
                  </td>
                  <td style={{ 
                    padding: '10px 12px', 
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--accent)'
                  }}>
                    {row.rating}
                  </td>
                </tr>
              ))}
              {leaders.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ 
                    color: 'var(--muted)', 
                    fontSize: 14, 
                    padding: '20px',
                    textAlign: 'center'
                  }}>
                    📊 No data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* My Recent Games */}
      {me && (
        <div className="card" style={{ 
          flexShrink: 0, 
          width: '100%', 
          maxWidth: '100%', 
          boxSizing: 'border-box',
          overflow: 'visible',
          minWidth: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          marginBottom: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📜</span>
              <span>My Recent Games</span>
            </h3>
            <Link 
              to={`/profile/${me.username}`} 
              className="btn btn-info"
              style={{ 
                fontSize: 13, 
                padding: '8px 16px',
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              View Games →
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Filter:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px', background: 'rgba(155, 89, 182, 0.15)', borderRadius: 6, border: '1px solid rgba(155, 89, 182, 0.3)' }}>
              <button
                type="button"
                onClick={() => setIncludeBotGames(true)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: 'none',
                  background: includeBotGames ? 'linear-gradient(135deg, #9b59b6, #8e44ad)' : 'transparent',
                  color: includeBotGames ? '#fff' : 'rgba(186, 104, 200, 0.8)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  boxShadow: includeBotGames ? '0 2px 8px rgba(155, 89, 182, 0.3)' : 'none'
                }}
              >
                With Bots
              </button>
              <button
                type="button"
                onClick={() => setIncludeBotGames(false)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: 'none',
                  background: !includeBotGames ? 'linear-gradient(135deg, #9b59b6, #8e44ad)' : 'transparent',
                  color: !includeBotGames ? '#fff' : 'rgba(186, 104, 200, 0.8)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  boxShadow: !includeBotGames ? '0 2px 8px rgba(155, 89, 182, 0.3)' : 'none'
                }}
              >
                No Bots
              </button>
            </div>
          </div>
          
          {myGamesLoading ? (
            <div style={{ textAlign: 'center', padding: 10, color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
          ) : (() => {
            // Filter games based on bot filter
            const filteredGames = myGames.filter((game) => {
              if (includeBotGames) return true; // Show all games
              // Filter out games where opponent is a bot
              const isWhite = game.white.id === me.id;
              const opponent = isWhite ? game.black : game.white;
              return !opponent.is_bot;
            });
            
            return filteredGames.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 10, color: 'var(--muted)', fontSize: 12 }}>
                {myGames.length === 0 ? (
                  <>No games yet. <Link to="/games/create" style={{ color: 'var(--accent)' }}>Start playing!</Link></>
                ) : (
                  'No games match the filter'
                )}
              </div>
            ) : (
              <>
                <div 
                className="games-list-scrollable"
                style={{ 
                  width: '100%', 
                  maxWidth: '100%', 
                  boxSizing: 'border-box', 
                  flex: '1 1 auto', 
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  minHeight: 0
                }}
              >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                    {filteredGames.map((game) => {
                  const isWhite = game.white.id === me.id;
                  const opponent = isWhite ? game.black : game.white;
                  const result = getResultForUser(game);
                  
                  return (
                    <div key={game.id} style={{ 
                      border: '1px solid var(--border)', 
                      borderRadius: 6, 
                      padding: '6px 8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <div style={{ 
                          width: 24, 
                          height: 24, 
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: 11,
                          flexShrink: 0,
                          ...getResultClass(result)
                        }}>
                          {result}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Link 
                              to={`/profile/${opponent.username}`} 
                              style={{ 
                                color: 'var(--text)', 
                                textDecoration: 'none', 
                                fontSize: 12,
                                fontWeight: 600,
                                transition: 'color 0.2s ease',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '120px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'var(--accent)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--text)';
                              }}
                            >
                              {opponent.username}
                            </Link>
                            <span style={{ color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                              {game.time_control} {game.rated && '• Rated'}
                            </span>
                          </div>
                          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                            {game.created_at ? new Date(game.created_at).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <Link 
                        to={`/games/${game.id}`} 
                        className="btn btn-info" 
                        style={{ fontSize: 10, padding: '4px 8px', flexShrink: 0 }}
                      >
                        View
                      </Link>
                    </div>
                  );
                  })}
                </div>
              </div>
              
              {/* Pagination - Outside the games container */}
              {Math.ceil(myGamesTotal / 2) > 1 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  gap: 'clamp(4px, 2vw, 8px)', 
                  marginTop: 12,
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 0 0 0',
                  flexWrap: 'wrap',
                  borderTop: '1px solid var(--border)',
                  position: 'relative',
                  zIndex: 10,
                  flexShrink: 0
                }}>
                  <button
                    className="btn btn-ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMyGamesPage(p => Math.max(1, p - 1));
                    }}
                    disabled={myGamesPage === 1}
                    style={{ 
                      fontSize: 'clamp(11px, 2.5vw, 13px)', 
                      padding: 'clamp(4px, 1.5vw, 6px) clamp(8px, 2.5vw, 12px)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      minWidth: 'clamp(50px, 12vw, 70px)',
                      textAlign: 'center',
                      cursor: myGamesPage === 1 ? 'not-allowed' : 'pointer',
                      opacity: myGamesPage === 1 ? 0.5 : 1
                    }}
                  >
                    ← Prev
                  </button>
                  <span style={{ 
                    color: 'var(--muted)', 
                    fontSize: 'clamp(11px, 2.5vw, 13px)',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    padding: '0 clamp(4px, 1.5vw, 8px)',
                    flexShrink: 0,
                    minWidth: 'fit-content',
                    textAlign: 'center'
                  }}>
                    {myGamesPage}/{Math.ceil(myGamesTotal / 2)}
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const nextPage = myGamesPage + 1;
                      const totalPages = Math.ceil(myGamesTotal / 2);
                      console.log('Next clicked:', { myGamesPage, nextPage, totalPages, myGamesTotal });
                      if (nextPage <= totalPages) {
                        setMyGamesPage(nextPage);
                      }
                    }}
                    disabled={myGamesPage >= Math.ceil(myGamesTotal / 2)}
                    style={{ 
                      fontSize: 'clamp(11px, 2.5vw, 13px)', 
                      padding: 'clamp(4px, 1.5vw, 6px) clamp(8px, 2.5vw, 12px)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      minWidth: 'clamp(50px, 12vw, 70px)',
                      textAlign: 'center',
                      cursor: myGamesPage >= Math.ceil(myGamesTotal / 2) ? 'not-allowed' : 'pointer',
                      opacity: myGamesPage >= Math.ceil(myGamesTotal / 2) ? 0.5 : 1,
                      position: 'relative',
                      zIndex: 11
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
