import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api/client';
import NotificationBell from './NotificationBell';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';

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
  const [authed, setAuthed] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return !!localStorage.getItem('token');
  });
  const [me, setMe] = useState<{ username: string; profile_pic?: string | null } | null>(null);

  useEffect(() => {
    const handler = () => setAuthed(!!localStorage.getItem('token'));
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    if (!authed) {
      setMe(null);
      return;
    }
    api
      .get('/api/accounts/me/')
      .then((r) => setMe({ username: r.data.username, profile_pic: r.data.profile_pic }))
      .catch(() => setMe(null));
  }, [authed]);

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

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
        <nav style={{ 
          display: 'flex', 
          gap: 6, 
          alignItems: 'center', 
          justifyContent: 'center',
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          padding: '0 16px',
          maxWidth: '100%'
        }}>
          <style>{`
            nav::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: pathname === l.to ? 'rgba(44, 230, 194, 0.15)' : 'transparent',
                color: pathname === l.to ? 'var(--accent)' : 'var(--text)',
                border: pathname === l.to ? '1px solid rgba(44, 230, 194, 0.3)' : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s ease',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (pathname !== l.to) {
                  e.currentTarget.style.background = 'rgba(44, 230, 194, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(44, 230, 194, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (pathname !== l.to) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: 14 }}>{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          ))}
        </nav>
        
        {/* User Actions Section */}
        <div className="auth-actions" style={{ 
          display: 'flex', 
          gap: 8, 
          alignItems: 'center',
          flexShrink: 0,
          minWidth: 'fit-content'
        }}>
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
