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
    <div className="layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, paddingTop: 24, paddingBottom: 24 }}>
      <div className="card" style={{ minHeight: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ 
            margin: 0, 
            fontSize: 18, 
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>💬</span>
            <span>Threads</span>
          </h3>
        </div>
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
          return (
            <div
              key={t.id}
              className="card"
              style={{
                padding: 12,
                marginBottom: 8,
                borderColor: selectedId === t.id ? 'var(--accent)' : 'var(--border)',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedId(t.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: '#1c2433',
                    backgroundImage: avatar ? `url(${avatar})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                />
                <div style={{ fontWeight: 700 }}>{name}</div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                {last ? (
                  <>
                    {lastSender && <span style={{ color: '#666' }}>{lastSender}</span>}
                    <span>{last}</span>
                  </>
                ) : (
                  <span style={{ color: '#666' }}>Tap to open</span>
                )}
              </div>
            </div>
          );
        })}
        {threads.length === 0 && (
          <div style={{ 
            color: 'var(--muted)', 
            textAlign: 'center',
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ fontSize: 32 }}>💬</span>
            <p style={{ fontSize: 15, margin: 0 }}>No conversations yet</p>
            <p style={{ fontSize: 13, margin: 0, opacity: 0.7 }}>Start chatting with friends!</p>
          </div>
        )}
      </div>
      <div className="card" style={{ minHeight: 420, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ 
          marginTop: 0, 
          marginBottom: 16,
          fontSize: 20,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>💬</span>
          <span>{title}</span>
        </h3>
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#0b1220', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m) => {
            const mine = me && m.sender.id === me.id;
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '70%',
                  background: mine ? '#1d8bff' : '#1f7a4f',
                  color: mine ? '#0b0f16' : 'var(--text)',
                  padding: '10px 12px',
                  borderRadius: 12,
                  boxShadow: '0 6px 14px rgba(0,0,0,0.25)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#0b0f16',
                      backgroundImage: m.sender.profile_pic ? `url(${m.sender.profile_pic})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: '1px solid var(--border)'
                    }}
                  />
                  <div style={{ fontWeight: 700 }}>{m.sender.username}</div>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: m.attachment_url ? 8 : 0 }}>{m.content}</div>
                {m.attachment_url && (
                  <div style={{ marginBottom: 4 }}>
                    {m.attachment_type?.startsWith('image/') ? (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer">
                        <img
                          src={m.attachment_url}
                          alt="attachment"
                          style={{ maxWidth: 240, borderRadius: 8, border: '1px solid var(--border)' }}
                        />
                      </a>
                    ) : (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: mine ? '#0b0f16' : 'var(--accent)' }}>
                        📎 Download attachment
                      </a>
                    )}
                  </div>
                )}
                <div style={{ color: mine ? '#0b0f16' : 'var(--muted)', fontSize: 11, marginTop: 6 }}>
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && <div style={{ color: 'var(--muted)' }}>No messages yet.</div>}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="btn" style={{ margin: 0, background: '#132036', color: '#7ac4ff', border: '1px dashed #21436d' }}>
            📎 Attach
            <input
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setAttachment(file);
              }}
            />
          </label>
          {attachment && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{attachment.name}</span>}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button className="btn btn-info" type="button" onClick={handleSend} disabled={!selectedId} style={{ fontSize: 14, padding: '10px 20px' }}>📤 Send</button>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  );
}
