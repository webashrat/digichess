import { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { GameSummary, Mode } from '../api/types';
import MiniChessBoard from './MiniChessBoard';

interface GameHistoryItem extends GameSummary {
  created_at?: string;
}

interface GameHistoryProps {
  username: string;
  currentUserId?: number;
}

export default function GameHistory({ username, currentUserId }: GameHistoryProps) {
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [includeBotGames, setIncludeBotGames] = useState(true); // Filter for bot games
  const [historyPreview, setHistoryPreview] = useState<{ id: number; fen: string; top: number; left: number } | null>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  
  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [includeBotGames]);

  const pageSize = 5;

  const loadGames = async () => {
    if (!username) return;
    
    setLoading(true);
    setError('');
    
    try {
      const params: any = {
        page: page.toString(),
        page_size: pageSize.toString(),
        status: 'finished',
        sort: '-created_at'
      };
      
      console.log('[GameHistory] Request params:', params);
      const { data } = await api.get(`/api/games/user/${username}/`, { params });
      console.log('[GameHistory] Response:', { 
        received: data?.results?.length, 
        total: data?.total,
        page_size: data?.page_size 
      });
      
      // Backend should return exactly pageSize games per page
      const gamesList = data?.results || [];
      const totalCount = data?.total || 0;
      
      // Store all games, filtering will be done in render
      setGames(gamesList);
      setTotal(totalCount);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, page]);

  useEffect(() => {
    const clearPreview = () => setHistoryPreview(null);
    window.addEventListener('scroll', clearPreview, true);
    window.addEventListener('resize', clearPreview);
    return () => {
      window.removeEventListener('scroll', clearPreview, true);
      window.removeEventListener('resize', clearPreview);
    };
  }, []);

  const getResultForUser = (game: GameHistoryItem, userId: number): string => {
    if (!game.result || game.result === '*') return '-';
    
    const isWhite = game.white.id === userId;
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

  // Filter games based on bot filter
  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      if (includeBotGames) return true; // Show all games
      // Filter out games where opponent is a bot
      const isWhite = game.white.username === username;
      const opponent = isWhite ? game.black : game.white;
      return !opponent.is_bot;
    });
  }, [games, includeBotGames, username]);
  
  const totalPages = Math.ceil(total / pageSize);

  if (!username) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Game History</h3>
        <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center' }}>
          No username provided
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Recent Games</h3>
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
          {loading ? 'Loading...' : `${filteredGames.length} of ${total} game${total !== 1 ? 's' : ''}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexShrink: 0, flexWrap: 'wrap' }}>
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

      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: 16, padding: 12, backgroundColor: 'rgba(239, 83, 80, 0.1)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', flex: '1 1 auto' }}>Loading games...</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--danger)', flex: '1 1 auto' }}>{error}</div>
      ) : filteredGames.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', flex: '1 1 auto' }}>
          {games.length === 0 ? 'No games found' : 'No games match the filter'}
        </div>
      ) : (
        <>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 auto', overflowY: 'auto', minHeight: 0, position: 'relative' }}
            ref={historyListRef}
            onScroll={() => setHistoryPreview(null)}
          >
            {filteredGames.map((game) => {
              const isWhite = game.white.username === username;
              const opponent = isWhite ? game.black : game.white;
              const result = currentUserId ? getResultForUser(game, currentUserId) : 
                (game.result === '1-0' ? (isWhite ? 'W' : 'L') :
                 game.result === '0-1' ? (isWhite ? 'L' : 'W') :
                 game.result === '1/2-1/2' ? 'D' : '-');
              
              return (
                <Link
                  key={game.id}
                  to={`/games/${game.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background-color 0.2s',
                    position: 'relative',
                    overflow: 'visible'
                  }}
                  onMouseEnter={(e) => {
                    if (!game.current_fen) return;
                    const rowRect = (e.currentTarget as HTMLAnchorElement).getBoundingClientRect();
                    const previewSize = 108;
                    const frameSize = previewSize + 12;
                    const padding = 8;
                    const sideGap = 12;
                    const midY = rowRect.top + rowRect.height / 2;
                    const top = Math.max(padding, Math.min(midY - frameSize / 2, window.innerHeight - frameSize - padding));
                    const rawLeft = rowRect.right - frameSize;
                    const maxLeft = (window.innerWidth || document.documentElement.clientWidth) - frameSize - padding;
                    const left = Math.max(padding, Math.min(rawLeft, maxLeft));
                    setHistoryPreview({ id: game.id, fen: game.current_fen, top, left });
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseMove={(e) => {
                    if (!game.current_fen) return;
                    const rowRect = (e.currentTarget as HTMLAnchorElement).getBoundingClientRect();
                    const previewSize = 108;
                    const frameSize = previewSize + 12;
                    const padding = 8;
                    const sideGap = 12;
                    const midY = rowRect.top + rowRect.height / 2;
                    const top = Math.max(padding, Math.min(midY - frameSize / 2, window.innerHeight - frameSize - padding));
                    const rawLeft = rowRect.right - frameSize;
                    const maxLeft = (window.innerWidth || document.documentElement.clientWidth) - frameSize - padding;
                    const left = Math.max(padding, Math.min(rawLeft, maxLeft));
                    setHistoryPreview({ id: game.id, fen: game.current_fen, top, left });
                  }}
                  onMouseLeave={(e) => {
                    setHistoryPreview((prev) => (prev?.id === game.id ? null : prev));
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 16,
                    ...getResultClass(result),
                    backgroundColor: result === 'W' ? 'rgba(44, 230, 194, 0.1)' : 
                                   result === 'L' ? 'rgba(239, 83, 80, 0.1)' : 
                                   'rgba(156, 166, 184, 0.1)'
                  }}>
                    {result}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Link 
                        to={`/profile/${opponent.username}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
                      >
                        {opponent.username}
                      </Link>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {game.time_control} {game.rated && '• Rated'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {game.created_at ? new Date(game.created_at).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    →
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination - Always visible at bottom */}
          {Math.ceil(total / pageSize) > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, flexShrink: 0, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                ← Prev
              </button>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 14 }}>
                Page {page} of {Math.ceil(total / pageSize)}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
                disabled={page >= Math.ceil(total / pageSize)}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
      {historyPreview && (
        <div
          style={{
            position: 'fixed',
            left: historyPreview.left,
            top: historyPreview.top,
            zIndex: 1000,
            pointerEvents: 'none',
            background: 'linear-gradient(160deg, rgba(12, 18, 32, 0.98), rgba(8, 12, 22, 0.98))',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 10,
            padding: 6,
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.5)'
          }}
        >
          <MiniChessBoard fen={historyPreview.fen} size={108} />
        </div>
      )}
    </div>
  );
}

