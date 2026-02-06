import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMessages, listThreads, sendMessage } from '../api/social';
import { fetchMe } from '../api/account';

interface Thread {
  id: number;
  participants: { id: number; username: string; profile_pic?: string | null }[];
  last_message?: string;
  last_sender?: string;
}

interface Message {
  id: number;
  sender: { id: number; username: string; profile_pic?: string | null };
  content: string;
  attachment?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  created_at: string;
}

export default function Chat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: number; username: string } | null>(null);
  const [params] = useSearchParams();

  useEffect(() => {
    listThreads()
      .then((data) => {
        setThreads(data || []);
        const fromParam = params.get('thread');
        if (fromParam) setSelectedId(Number(fromParam));
      })
      .catch(() => setError('Could not load threads'));
    fetchMe().then((u) => setMe({ id: u.id, username: u.username })).catch(() => {});
  }, [params]);

  useEffect(() => {
    if (!selectedId) return;
    getMessages(selectedId)
      .then((data) => {
        setMessages(data || []);
        if (data && data.length) {
          const last = data[data.length - 1];
          setThreads((prev) =>
            prev.map((t) =>
              t.id === selectedId
                ? { ...t, last_message: last.content, last_sender: last.sender?.username }
                : t
            )
          );
        }
      })
      .catch(() => setError('Could not load messages'));
  }, [selectedId]);

  const handleSend = () => {
    if (!selectedId || (!input.trim() && !attachment)) return;
    sendMessage(selectedId, { content: input.trim(), attachment })
      .then((msg) => {
        setInput('');
        setAttachment(null);
        setMessages((prev) => [...prev, msg]);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === selectedId ? { ...t, last_message: msg.content || 'Attachment', last_sender: msg.sender?.username } : t
          )
        );
      })
      .catch(() => setError('Send failed'));
  };

  const title = useMemo(() => {
    const t = threads.find((th) => th.id === selectedId);
    if (!t) return 'Messages';
    const others = me ? t.participants.filter((p) => p.id !== me.id).map((p) => p.username).join(', ') : t.participants.map((p) => p.username).join(', ');
    return `Chat with ${others}`;
  }, [threads, selectedId, me]);

  return (
    <div className="layout chat-shell">
      <div className="card chat-panel">
        <div className="chat-header">
          <div className="chat-header-title">
            <span style={{ fontSize: 14 }}>💬</span>
            <span>Direct Messages</span>
          </div>
          {threads.length > 0 && <span className="text-muted" style={{ fontSize: 11 }}>{threads.length}</span>}
        </div>
        <div className="chat-list">
          {threads.map((t) => {
            const others = me ? t.participants.filter((p) => p.id !== me.id) : t.participants;
            const name = others.length ? others.map((p) => p.username).join(', ') : 'Me';
            const avatar =
              others[0]?.profile_pic ||
              t.participants.find((p) => !me || p.id !== me?.id)?.profile_pic ||
              others[0]?.profile_pic ||
              t.participants[0]?.profile_pic;
            const last =
              t.last_message ||
              (t as any).last_message_content ||
              (t as any).preview ||
              '';
            const lastSender =
              (t as any).last_sender ||
              (t as any).last_sender_username ||
              '';
            const active = selectedId === t.id;
            return (
              <div
                key={t.id}
                className={`chat-thread${active ? ' active' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: '#1c2433',
                    backgroundImage: avatar ? `url(${avatar})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                />
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="chat-thread-title">{name}</div>
                  <div className="chat-thread-preview">
                    {last ? `${lastSender ? `${lastSender}: ` : ''}${last}` : 'Tap to open'}
                  </div>
                </div>
              </div>
            );
          })}
          {threads.length === 0 && (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 28 }}>💬</span>
              <p style={{ fontSize: 14, margin: 0 }}>No conversations yet</p>
              <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>Start chatting with friends!</p>
            </div>
          )}
        </div>
      </div>

      <div className="card chat-panel">
        <div className="chat-header">
          <div className="chat-header-title">
            <span style={{ fontSize: 14 }}>💬</span>
            <span>{title}</span>
          </div>
          {selectedId && <span className="text-muted" style={{ fontSize: 11 }}>Active</span>}
        </div>

        <div className="chat-body">
          {messages.length === 0 && (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 24, fontSize: 13 }}>
              No messages yet.
            </div>
          )}
          {messages.map((m) => {
            const mine = me && m.sender.id === me.id;
            const messageText = m.content || (m.attachment_url ? 'Attachment' : '');
            return (
              <div key={m.id} className={`chat-message${mine ? ' mine' : ''}`}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#0b0f16',
                    backgroundImage: m.sender.profile_pic ? `url(${m.sender.profile_pic})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '1px solid var(--border)'
                  }}
                />
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="chat-message-title">
                    <span className={`chat-message-sender${mine ? ' mine' : ''}`}>{m.sender.username}</span>
                    <span className="chat-message-time">{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  {messageText && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5 }}>{messageText}</div>}
                  {m.attachment_url && (
                    <div style={{ marginTop: 4 }}>
                      {m.attachment_type?.startsWith('image/') ? (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer">
                          <img
                            src={m.attachment_url}
                            alt="attachment"
                            style={{ maxWidth: 280, borderRadius: 8, border: '1px solid var(--border)' }}
                          />
                        </a>
                      ) : (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                          📎 Download attachment
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="chat-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedId ? 'Message your friend...' : 'Select a conversation to start'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={!selectedId}
            className="chat-input input-sm"
          />
          <button className="btn btn-primary" type="button" onClick={handleSend} disabled={!selectedId} style={{ fontSize: 13, padding: '8px 16px' }}>
            Send
          </button>
        </div>
        {error && <div className="form-message form-message--error" style={{ margin: '8px 16px' }}>{error}</div>}
      </div>
    </div>
  );
}
