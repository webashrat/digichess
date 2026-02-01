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
  const hideNav = /^\/games\/\d+$/.test(location.pathname);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  useEffect(() => {
    const handleToast = (e: CustomEvent) => {
      setToast({ message: e.detail.message, type: e.detail.type || 'info' });
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
            top: 16,
            right: 16,
            background: toast.type === 'error' ? 'var(--danger)' : toast.type === 'success' ? 'var(--accent)' : 'rgba(15, 23, 42, 0.9)',
            color: 'var(--text)',
            padding: '10px 14px',
            borderRadius: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            zIndex: 10000,
            maxWidth: 360,
            border: `1px solid ${toast.type === 'error' ? 'var(--danger)' : toast.type === 'success' ? 'var(--accent)' : 'rgba(148,163,184,0.25)'}`,
            fontSize: 13,
            fontWeight: 600
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{toast.type === 'error' ? '❌' : toast.type === 'success' ? '✓' : 'ℹ️'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
