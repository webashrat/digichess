import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getFriends, getFriendRequests, respondFriendRequest, createThread } from '../api/social';
import FlagIcon from '../components/FlagIcon';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';

export default function Friends() {
  const [friends, setFriends] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    getFriends()
      .then((data) => {
        const raw = (data as any).results || (Array.isArray(data) ? data : []);
        const normalized = raw.map((f: any) =>
          f.user
            ? {
                ...f.user,
                friendship_id: f.id
              }
            : f
        );
        setFriends(normalized);
      })
      .catch(() => setError('Failed to load friends'));
    getFriendRequests()
      .then((data) => {
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const handleRespond = (id: number, decision: 'accept' | 'decline') => {
    respondFriendRequest(id, decision).then(load).catch(() => setError('Failed to respond'));
  };

  const startChat = (userId: number, isBot?: boolean) => {
    // Don't allow chatting with bots
    if (isBot) {
      setError('Cannot message bots');
      return;
    }
    createThread(userId)
      .then((res) => {
        const threadId = res.id;
        if (threadId) navigate(`/messages?thread=${threadId}`);
      })
      .catch(() => setError('Could not start chat'));
  };

  return (
    <div className="layout" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 24, paddingBottom: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 800, 
          marginBottom: 8,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          👫 Friends
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 16, margin: 0 }}>
          Manage your friends and friend requests
        </p>
      </div>
      {error && (
        <div className="card" style={{ 
          color: 'var(--danger)',
          padding: 16,
          background: 'rgba(239, 83, 80, 0.1)',
          border: '1px solid var(--danger)',
          borderRadius: 8,
          fontSize: 15
        }}>
          ❌ {error}
        </div>
      )}
      <div className="card">
        <h3 style={{ 
          marginTop: 0, 
          marginBottom: 16,
          fontSize: 18,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>📨</span>
          <span>Friend Requests</span>
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {incoming.map((req) => {
            const fromUser = req.from_user || req;
            const username = fromUser.username || req.from_email || 'User';
            const firstName = fromUser.first_name;
            const lastName = fromUser.last_name;
            const profilePic = fromUser.profile_pic;
            
            return (
              <div key={req.id} className="pill" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    backgroundImage: profilePic ? `url(${profilePic})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                    ...(profilePic ? { background: '#1c2433' } : getDefaultAvatarStyle(username, firstName, lastName, 24))
                  }}
                >
                  {!profilePic && (
                    <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 10 }}>
                      {getDefaultAvatarContent(username, firstName, lastName)}
                    </span>
                  )}
                </div>
                <span>{username}</span>
                <button className="btn btn-success" type="button" onClick={() => handleRespond(req.id, 'accept')}>Accept</button>
                <button className="btn btn-danger" type="button" onClick={() => handleRespond(req.id, 'decline')}>Decline</button>
              </div>
            );
          })}
          {incoming.length === 0 && <span style={{ color: 'var(--muted)' }}>No incoming requests.</span>}
        </div>
      </div>
      <div className="card">
        <h3 style={{ 
          marginTop: 0, 
          marginBottom: 16,
          fontSize: 18,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>👥</span>
          <span>Your Friends</span>
        </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friends.map((f) => (
              <div key={f.id} className="card" style={{ padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <a href={`#/profile/${f.username}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      backgroundImage: f.profile_pic ? `url(${f.profile_pic})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      ...(f.profile_pic ? { background: '#1c2433' } : getDefaultAvatarStyle(f.username, f.first_name, f.last_name, 32))
                    }}
                  >
                    {!f.profile_pic && (
                      <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 12 }}>
                        {getDefaultAvatarContent(f.username, f.first_name, f.last_name)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 16 }}>{f.username}</div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: '#121c2f',
                        color: 'var(--text)',
                        fontSize: 13
                      }}
                    >
                      <FlagIcon code={f.country} size={18} />
                      <span style={{ letterSpacing: 0.3 }}>{(f.country || 'INTL').toString().toUpperCase()}</span>
                    </div>
                  </div>
                </a>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Link
                    to={`/games/create?opponent_id=${f.id}`}
                    className="btn btn-purple"
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
                    <span>⚔️</span>
                    <span>Challenge</span>
                  </Link>
                  {!f.is_bot && (
                    <button 
                      className="btn btn-info" 
                      type="button" 
                      onClick={() => startChat(f.id)}
                      style={{ fontSize: 13, padding: '8px 16px' }}
                    >
                      💬 Message
                    </button>
                  )}
                </div>
              </div>
            ))}
            {friends.length === 0 && <div style={{ color: 'var(--muted)' }}>No friends yet.</div>}
          </div>
        </div>
      </div>
  );
}
