import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import NotificationBell from './NotificationBell';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';
import { pingPresence } from '../api/account';
import { BOARD_THEMES, PIECE_SETS } from '../utils/boardPresets';
import { setHashRoute } from '../utils/hashNavigate';

const links = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/games', label: 'Games', icon: '🎮' },
  { to: '/games/create', label: 'Create', icon: '➕' },
  { to: '/leaderboards', label: 'Leaderboards', icon: '🏆' },
  { to: '/tournaments', label: 'Tournaments', icon: '🏟️' },
  { to: '/players', label: 'Players', icon: '👥' },
  { to: '/friends', label: 'Friends', icon: '👫' },
  { to: '/messages', label: 'Messages', icon: '💬' }
];

export default function NavBar() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const [authed, setAuthed] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return !!localStorage.getItem('token');
  });
  const [me, setMe] = useState<{ username: string; profile_pic?: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardTheme, setBoardTheme] = useState(() => {
    if (typeof localStorage === 'undefined') return 0;
    const stored = Number(localStorage.getItem('boardTheme'));
    return Number.isFinite(stored) ? stored : 0;
  });
  const [pieceSet, setPieceSet] = useState(() => {
    if (typeof localStorage === 'undefined') return 'cburnett';
    return localStorage.getItem('pieceSet') || 'cburnett';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    const stored = localStorage.getItem('soundEnabled');
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    const handler = () => setAuthed(!!localStorage.getItem('token'));
    window.addEventListener('storage', handler);
    window.addEventListener('auth-changed', handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('auth-changed', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    setAuthed(!!localStorage.getItem('token'));
  }, [pathname]);

  useEffect(() => {
    if (!authed) {
      setMe(null);
      return;
    }
    api
      .get('/api/accounts/me/')
      .then((r) => setMe({ username: r.data.username, profile_pic: r.data.profile_pic }))
      .catch(() => setMe(null));
    
    // Setup presence ping - ping every 60 seconds to keep user online
    pingPresence().catch(() => {}); // Ping immediately
    const pingInterval = setInterval(() => {
      pingPresence().catch(() => {});
    }, 60000); // Ping every 60 seconds
    
    return () => clearInterval(pingInterval);
  }, [authed]);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;
    const activeLink = navEl.querySelector<HTMLAnchorElement>('a[data-active="true"]');
    if (!activeLink) {
      navEl.scrollLeft = 0;
      return;
    }
    const navRect = navEl.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const padding = 12;
    if (linkRect.left < navRect.left + padding) {
      navEl.scrollLeft -= navRect.left + padding - linkRect.left;
      return;
    }
    if (linkRect.right > navRect.right - padding) {
      navEl.scrollLeft += linkRect.right - (navRect.right - padding);
    }
  }, [pathname]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('boardTheme', String(boardTheme));
    window.dispatchEvent(new Event('board-settings-change'));
  }, [boardTheme]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('pieceSet', pieceSet);
    window.dispatchEvent(new Event('board-settings-change'));
  }, [pieceSet]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('soundEnabled', soundEnabled ? 'true' : 'false');
    window.dispatchEvent(new Event('sound-settings-change'));
  }, [soundEnabled]);

  const logout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-changed'));
    setHashRoute('/');
  };
  const showSettings = pathname === '/';

  return (
    <header style={{ 
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      backgroundColor: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        gap: 16,
        paddingTop: '10px', 
        paddingBottom: '10px',
        paddingLeft: '24px',
        paddingRight: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        position: 'relative'
      }}>
        {/* Logo Section */}
        <Link 
          to="/" 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 10,
            textDecoration: 'none',
            color: 'var(--text)',
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: 0.5,
            transition: 'opacity 0.2s ease',
            flexShrink: 0,
            minWidth: 'fit-content'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          <svg 
            width="28" 
            height="28" 
            viewBox="0 0 50 50" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0 }}
          >
            {/* Chess Knight Logo - Lichess style */}
            <path 
              d="M38.956 0.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084C3.959 39.116-.506 27.392 4.683 17.567 9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z" 
              fill="#C0C0C0"
              stroke="#A8A8A8"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ 
            color: '#9CA6B8',
            fontWeight: 800,
            letterSpacing: 1,
            whiteSpace: 'nowrap'
          }}>
            DigiChess
          </span>
        </Link>
        
        {/* Navigation Menu - Centered */}
        <nav
          ref={navRef}
          style={{ 
          display: 'flex', 
          gap: 8, 
          alignItems: 'center', 
          justifyContent: 'flex-start',
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          padding: '0 14px',
          maxWidth: '100%',
          scrollPaddingLeft: 16,
          scrollPaddingRight: 16
        }}>
          <style>{`
            nav::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {links.map((l) => {
            const isActive = pathname === l.to;
            return (
            <Link
              key={l.to}
              to={l.to}
              data-active={isActive ? 'true' : 'false'}
              aria-current={isActive ? 'page' : undefined}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1,
                background: isActive ? 'rgba(44, 230, 194, 0.18)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text)',
                border: isActive ? '1px solid rgba(44, 230, 194, 0.35)' : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s ease',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                scrollMarginLeft: 16,
                scrollMarginRight: 16
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(44, 230, 194, 0.07)';
                  e.currentTarget.style.borderColor = 'rgba(44, 230, 194, 0.18)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          )})}
        </nav>
        
        {/* User Actions Section */}
        <div className="auth-actions" style={{ 
          display: 'flex', 
          gap: 8, 
          alignItems: 'center',
          flexShrink: 0,
          minWidth: 'fit-content'
        }}>
          {showSettings && (
            <div ref={settingsRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setSettingsOpen((prev) => !prev)}
                style={{ 
                  fontSize: 12, 
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
              >
                <span style={{ fontSize: 14 }}>⚙️</span>
                <span>Settings</span>
              </button>
              {settingsOpen && (
                <div
                  role="dialog"
                  aria-label="Board settings"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    width: 260,
                    background: 'linear-gradient(180deg, rgba(12, 18, 32, 0.98), rgba(10, 14, 24, 0.98))',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: 12,
                    padding: 12,
                    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 1001
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                    Board Settings
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Theme</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          value={boardTheme}
                          onChange={(e) => setBoardTheme(Number(e.target.value))}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '7px 10px',
                            fontSize: 12,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: '#0b1220',
                            color: 'var(--text)',
                            appearance: 'auto'
                          }}
                        >
                          {BOARD_THEMES.map((theme, idx) => (
                            <option key={theme.name} value={idx}>
                              {theme.name}
                            </option>
                          ))}
                        </select>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 12px)',
                            width: 24,
                            height: 12,
                            borderRadius: 4,
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)'
                          }}
                        >
                          <span style={{ background: BOARD_THEMES[boardTheme]?.light || '#f0d9b5' }} />
                          <span style={{ background: BOARD_THEMES[boardTheme]?.dark || '#b58863' }} />
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Pieces</label>
                      <select
                        value={pieceSet}
                        onChange={(e) => setPieceSet(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          fontSize: 12,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: '#0b1220',
                          color: 'var(--text)',
                          appearance: 'auto'
                        }}
                      >
                        {PIECE_SETS.map((set) => (
                          <option key={set.value} value={set.value}>
                            {set.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      Saved for new games.
                    </div>
                    <div style={{ marginTop: 6, borderTop: '1px solid rgba(148, 163, 184, 0.15)', paddingTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                        Sound
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          checked={soundEnabled}
                          onChange={(e) => setSoundEnabled(e.target.checked)}
                          style={{ width: 16, height: 16 }}
                        />
                        Enable sounds
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {!authed && (
            <>
              <Link className="btn btn-ghost" to="/login" style={{ fontSize: 12, padding: '6px 12px' }}>Log in</Link>
              <Link className="btn btn-primary" to="/register" style={{ fontSize: 12, padding: '6px 12px' }}>Sign up</Link>
            </>
          )}
          {authed && (
            <>
              <NotificationBell />
              <Link 
                to={`/profile/${me?.username || ''}`} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  textDecoration: 'none',
                  padding: '4px 8px',
                  borderRadius: 8,
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: '2px solid var(--border)',
                    backgroundImage: me?.profile_pic ? `url(${me.profile_pic})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                    ...(me?.profile_pic ? {} : getDefaultAvatarStyle(me?.username || 'Account', undefined, undefined, 32))
                  }}
                >
                  {!me?.profile_pic && me?.username && (
                    <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 13 }}>
                      {getDefaultAvatarContent(me.username)}
                    </span>
                  )}
                </div>
                <span style={{ 
                  cursor: 'pointer', 
                  fontSize: 13, 
                  fontWeight: 500,
                  color: 'var(--text)',
                  whiteSpace: 'nowrap'
                }}>
                  {me?.username || 'Account'}
                </span>
              </Link>
              <button 
                className="btn" 
                type="button" 
                onClick={logout} 
                style={{ 
                  fontSize: 12, 
                  padding: '6px 12px',
                  background: 'linear-gradient(90deg, #ef5350, #d32f2f)',
                  color: '#ffffff',
                  border: '1px solid #d32f2f',
                  fontWeight: 600
                }}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
