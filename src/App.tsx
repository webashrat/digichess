import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
    </div>
  );
}

export default App;
