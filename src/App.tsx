import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Games from './pages/Games';
import GameView from './pages/GameView';
import Profile from './pages/Profile';
import Leaderboards from './pages/Leaderboards';
import Tournaments from './pages/Tournaments';
import TournamentCreate from './pages/TournamentCreate';
import TournamentDetail from './pages/TournamentDetail';
import Accounts from './pages/Accounts';
import GameCreate from './pages/GameCreate';
import AccountEdit from './pages/AccountEdit';
import Chat from './pages/Chat';
import Friends from './pages/Friends';
import NavBar from './components/NavBar';

function App() {
  const location = useLocation();
  const routeProbe = `${location.pathname}${location.hash}${window.location.pathname}${window.location.hash}`;
  const isGameRoute = /\/games\/\d+/.test(routeProbe);
  const hideNav = isGameRoute;
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success'; emoji?: string } | null>(null);

  useEffect(() => {
    const handleToast = (e: CustomEvent) => {
      setToast({ message: e.detail.message, type: e.detail.type || 'info', emoji: e.detail.emoji });
      setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener('show-toast' as any, handleToast as EventListener);
    return () => window.removeEventListener('show-toast' as any, handleToast as EventListener);
  }, []);

  return (
    <div className="app-shell">
      {!hideNav && <NavBar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/create" element={<GameCreate />} />
        <Route path="/games/:id" element={<GameView key={location.pathname} />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="/leaderboards" element={<Leaderboards />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/tournaments/create" element={<TournamentCreate />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/players" element={<Accounts />} />
        <Route path="/me" element={<AccountEdit />} />
        <Route path="/messages" element={<Chat />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: isGameRoute ? '50%' : 16,
            left: isGameRoute ? '50%' : 'auto',
            right: isGameRoute ? 'auto' : 16,
            transform: isGameRoute ? 'translate(-50%, -50%)' : 'none',
            background: toast.type === 'error'
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))'
              : toast.type === 'success'
              ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(16, 185, 129, 0.95))'
              : 'linear-gradient(135deg, rgba(250, 204, 21, 0.95), rgba(245, 158, 11, 0.95))',
            color: isGameRoute ? '#0b0b0b' : 'var(--text)',
            padding: isGameRoute ? '14px 22px' : '10px 14px',
            borderRadius: isGameRoute ? 16 : 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            zIndex: 10000,
            maxWidth: isGameRoute ? 420 : 360,
            border: `2px solid ${toast.type === 'error' ? 'rgba(239, 68, 68, 1)' : toast.type === 'success' ? 'rgba(34, 197, 94, 1)' : 'rgba(250, 204, 21, 1)'}`,
            fontSize: isGameRoute ? 14 : 13,
            fontWeight: 700,
            textAlign: 'center',
            pointerEvents: 'none',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: isGameRoute ? 22 : 14 }}>
              {toast.emoji || (toast.type === 'error' ? '😵‍💫💥' : toast.type === 'success' ? '🏆😄' : '🤝😅')}
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
