import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import { fetchAccounts, fetchAccountDetail } from '../api/users';
import { AccountListItem } from '../api/types';
import { fetchMe } from '../api/account';
import { createThread } from '../api/social';
import FlagIcon from '../components/FlagIcon';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';

export default function Accounts() {
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [ratingLookup, setRatingLookup] = useState<Record<string, number>>({});
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: number; username?: string } | null>(null);
  const [challengingId, setChallengingId] = useState<number | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const showOnlineOnly = new URLSearchParams(location.search).get('online') === '1';
  const rowBg = 'rgba(15, 23, 42, 0.55)';
  const rowBorder = '1px solid rgba(148, 163, 184, 0.12)';
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(1);
  }, [showOnlineOnly]);

  const challengePlayer = async (userId: number) => {
    if (!localStorage.getItem('token')) {
      setError('Please login to challenge players');
      return;
    }
    setError('');
    setChallengingId(userId);
    try {
      const { data } = await api.post('/api/games/', {
        opponent_id: userId,
        preferred_color: 'auto',
        time_control: 'blitz',
        rated: true
      });
      const id = data?.id;
      if (id) {
        navigate(`/games/${id}`);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || 'Failed to challenge player';
      setError(errorMsg);
    } finally {
      setChallengingId(null);
    }
  };

  useEffect(() => {
    fetchAccounts({ page, page_size: 20, search, online_only: showOnlineOnly ? 1 : undefined })
      .then((res) => {
        // Filter out bots and the current user from the results
        const filteredResults = (res.results || []).filter((item: any) => {
          if (item.is_bot) return false;
          if (me?.id && item.id === me.id) return false;
          return true;
        });
        setItems(filteredResults);
        const removedBots = (res.results || []).filter((item: any) => item.is_bot).length;
        const removedSelf = me?.id ? (res.results || []).filter((item: any) => item.id === me.id).length : 0;
        setTotal(Math.max(0, (res.count || 0) - removedBots - removedSelf));
      })
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
  }, [page, search, showOnlineOnly, me?.id]);

  useEffect(() => {
    fetchMe()
      .then((u) => {
        setMe({ id: u.id, username: u.username });
      })
      .catch(() => {
        setMe(null);
      });
  }, []);

  useEffect(() => {
    const updateRowHeight = () => {
      if (!listRef.current) return;
      const visibleRows = items.length;
      if (visibleRows === 0 || visibleRows > 6) {
        setRowHeight(null);
        return;
      }
      const containerHeight = listRef.current.clientHeight;
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      const tableOffset = 8;
      const spacing = 10 * Math.max(visibleRows - 1, 0);
      const available = Math.max(0, containerHeight - headerHeight - tableOffset - spacing);
      const target = Math.floor(available / visibleRows);
      const clamped = Math.max(72, Math.min(180, target));
      setRowHeight(clamped);
    };
    updateRowHeight();
    window.addEventListener('resize', updateRowHeight);
    return () => window.removeEventListener('resize', updateRowHeight);
  }, [items.length]);

  useEffect(() => {
    let cancelled = false;
    const missing = items.filter((u) => u.rating_blitz === undefined || u.rating_blitz === null)
      .filter((u) => ratingLookup[u.username] === undefined);
    if (missing.length === 0) return;
    Promise.all(
      missing.map((u) =>
        fetchAccountDetail(u.username)
          .then((detail) => ({ username: u.username, rating: detail.rating_blitz }))
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      setRatingLookup((prev) => {
        const next = { ...prev };
        results.forEach((res) => {
          if (!res || res.rating === undefined || res.rating === null) return;
          next[res.username] = res.rating;
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items, ratingLookup]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="layout" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 12, 
      height: 'calc(100vh - 100px)', 
      maxHeight: 'calc(100vh - 100px)',
      overflow: 'hidden', 
      paddingTop: 16, 
      paddingBottom: 16,
      boxSizing: 'border-box'
    }}>
      <div className="card" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: 12,
        padding: 16
      }}>
        <div>
          <h1 style={{ 
            fontSize: 26, 
            fontWeight: 800, 
            marginBottom: 4,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            👥 {showOnlineOnly ? 'Online Players' : 'Players'}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            {showOnlineOnly ? 'Challenge players who are online right now' : 'Browse and connect with other players'}
          </p>
        </div>
        <input
          style={{
            maxWidth: 240,
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'linear-gradient(160deg, rgba(10, 16, 28, 0.8), rgba(9, 13, 24, 0.95))',
            color: 'var(--text)',
            boxShadow: '0 8px 18px rgba(0,0,0,0.35)'
          }}
          placeholder="🔍 Search username..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>
      <div className="card" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div 
          className="games-list-scrollable"
          ref={listRef}
          style={{ 
            overflowY: 'auto', 
            overflowX: 'hidden',
            flex: '1 1 auto', 
            minHeight: 0,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(26, 34, 51, 0.6) transparent'
          }}
        >
        <table className="table" style={{ marginTop: 8, width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
          <thead ref={headerRef}>
            <tr>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Avatar</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Username</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Rating</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Country</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Chat</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Challenge</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr
                key={u.id}
                style={{ transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 12px 26px rgba(0,0,0,0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <td style={{ padding: '12px 16px', background: rowBg, borderTop: rowBorder, borderBottom: rowBorder, borderLeft: rowBorder, borderRadius: '12px 0 0 12px', height: rowHeight || undefined, verticalAlign: 'middle' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      backgroundImage: u.profile_pic ? `url(${u.profile_pic})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      ...(u.profile_pic ? { background: '#1c2433' } : getDefaultAvatarStyle(u.username, u.first_name, u.last_name, 36))
                    }}
                  >
                    {!u.profile_pic && (
                      <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 14 }}>
                        {getDefaultAvatarContent(u.username, u.first_name, u.last_name)}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', background: rowBg, borderTop: rowBorder, borderBottom: rowBorder, height: rowHeight || undefined, verticalAlign: 'middle' }}>
                  <a style={{ color: 'var(--text)', fontWeight: 600 }} href={`#/profile/${u.username}`}>{u.username}</a>
                </td>
                <td style={{ padding: '12px 16px', background: rowBg, borderTop: rowBorder, borderBottom: rowBorder, height: rowHeight || undefined, verticalAlign: 'middle' }}>
                  {(() => {
                    const blitzRating = u.rating_blitz ?? ratingLookup[u.username];
                    return blitzRating !== undefined && blitzRating !== null ? (
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: '#baffef',
                        background: 'linear-gradient(135deg, rgba(72, 255, 214, 0.35), rgba(18, 80, 70, 0.45))',
                        border: '1px solid rgba(136, 255, 224, 0.6)',
                        padding: '4px 12px',
                        borderRadius: 12,
                        boxShadow: '0 0 0 1px rgba(72, 255, 214, 0.35), 0 10px 22px rgba(0,0,0,0.45)',
                        textShadow: '0 0 14px rgba(120, 255, 230, 0.85)',
                        letterSpacing: '0.6px',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}
                    >
                      {blitzRating}
                    </span>
                    ) : (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                    );
                  })()}
                </td>
                <td style={{ padding: '12px 16px', background: rowBg, borderTop: rowBorder, borderBottom: rowBorder, height: rowHeight || undefined, verticalAlign: 'middle' }}>
                  <FlagIcon code={u.country} size={18} />
                </td>
                <td style={{ padding: '12px 16px', background: rowBg, borderTop: rowBorder, borderBottom: rowBorder, height: rowHeight || undefined, verticalAlign: 'middle' }}>
                  {!u.is_bot && (
                    <button
                      className="btn btn-info"
                      type="button"
                      onClick={() => {
                        createThread(u.id)
                          .then((res) => {
                            const threadId = res.id;
                            if (threadId) navigate(`/messages?thread=${threadId}`);
                          })
                          .catch(() => setError('Could not start chat'));
                      }}
                      style={{ fontSize: 13, padding: '6px 12px' }}
                    >
                      💬 Chat
                    </button>
                  )}
                  {u.is_bot && (
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', background: rowBg, borderTop: rowBorder, borderBottom: rowBorder, borderRight: rowBorder, borderRadius: '0 12px 12px 0', height: rowHeight || undefined, verticalAlign: 'middle' }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={challengingId === u.id}
                    onClick={() => challengePlayer(u.id)}
                    style={{ fontSize: 13, padding: '6px 12px' }}
                  >
                    {challengingId === u.id ? 'Sending...' : '⚔️ Challenge'}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--muted)', padding: '24px', textAlign: 'center' }}>
                  {showOnlineOnly ? '😴 Everyone is offline right now' : '😶 No players found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, flexShrink: 0 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, flexShrink: 0 }}>
          <button className="btn btn-info" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ opacity: page <= 1 ? 0.5 : 1 }}>← Prev</button>
          <div style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>Page {page} / {totalPages}</div>
          <button className="btn btn-info" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ opacity: page >= totalPages ? 0.5 : 1 }}>Next →</button>
        </div>
      </div>
    </div>
  );
}
