import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAccounts } from '../api/users';
import { AccountListItem } from '../api/types';
import { createThread } from '../api/social';
import { flagFromCode } from '../utils/flags';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';

export default function Accounts() {
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchAccounts({ page, page_size: 20, search })
      .then((res) => {
        // Filter out bots from the results
        const filteredResults = (res.results || []).filter((item: any) => !item.is_bot);
        setItems(filteredResults);
        // Adjust total count (approximate, since we're filtering)
        setTotal(Math.max(0, (res.count || 0) - (res.results || []).filter((item: any) => item.is_bot).length));
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
  }, [page, search]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="layout" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 16, 
      height: 'calc(100vh - 100px)', 
      maxHeight: 'calc(100vh - 100px)',
      overflow: 'hidden', 
      paddingTop: 24, 
      paddingBottom: 24,
      boxSizing: 'border-box'
    }}>
      <div className="card" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: 16,
        padding: 20
      }}>
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
            👥 Players
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 16, margin: 0 }}>
            Browse and connect with other players
          </p>
        </div>
        <input
          style={{ maxWidth: 280, fontSize: 15, padding: '12px 16px' }}
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
          style={{ 
            overflowY: 'auto', 
            overflowX: 'hidden',
            flex: '1 1 auto', 
            minHeight: 0,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(26, 34, 51, 0.6) transparent'
          }}
        >
        <table className="table" style={{ marginTop: 8, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Avatar</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Name</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Username</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Country</th>
              <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Chat</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>
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
                <td>{`${u.first_name || ''} ${u.last_name || ''}`.trim() || '—'}</td>
                <td>
                  <a style={{ color: 'var(--text)' }} href={`/profile/${u.username}`}>{u.username}</a>
                </td>
                <td>{flagFromCode(u.country)}</td>
                <td>
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
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)' }}>No accounts.</td>
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
