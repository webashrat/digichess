import { api } from './api/client';

export const login = (identifier, password) =>
    api.post('/accounts/login/', {
        email: identifier.includes('@') ? identifier : undefined,
        username: identifier.includes('@') ? undefined : identifier,
        password,
    });

export const registerAccount = (payload) => api.post('/accounts/register/', payload);

export const verifyOtp = (email, code) =>
    api.post('/accounts/verify-otp/', { email, code });

export const resendOtp = (email) =>
    api.post('/accounts/resend-otp/', { email });

export const logout = () => api.post('/accounts/logout/');

export const fetchMe = () => api.get('/accounts/me/');

export const updateProfile = (payload) => api.patch('/accounts/me/', payload);

export const fetchLeaderboard = (mode = 'blitz', page = 1, limit = 100) =>
    api.get(`/games/leaderboard/ratings/?mode=${mode}&page=${page}&limit=${limit}`);

export const fetchDigiQuizLeaderboard = (page = 1, limit = 100) =>
    api.get(`/games/leaderboard/digiquiz/?page=${page}&limit=${limit}`);

export const fetchPublicGames = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/games/public/${query ? `?${query}` : ''}`);
};

export const createGame = (payload) => api.post('/games/', payload);

export const getGame = (gameId) => api.get(`/games/${gameId}/`);

export const spectateGame = (gameId) => api.get(`/games/${gameId}/spectate/`);

export const makeMove = (gameId, move) => api.post(`/games/${gameId}/move/`, { move });

export const optimisticMove = (gameId, move) => api.post(`/games/${gameId}/move/optimistic/`, { move });

export const resignGame = (gameId) => api.post(`/games/${gameId}/resign/`);

export const abortGame = (gameId) => api.post(`/games/${gameId}/abort/`);

export const acceptGame = (gameId) => api.post(`/games/${gameId}/accept/`);

export const rejectGame = (gameId) => api.post(`/games/${gameId}/reject/`);

export const offerDraw = (gameId) => api.post(`/games/${gameId}/offer-draw/`);

export const respondDraw = (gameId, decision) =>
    api.post(`/games/${gameId}/respond-draw/`, { decision });

export const claimDraw = (gameId) => api.post(`/games/${gameId}/claim-draw/`);

export const requestRematch = (gameId) => api.post(`/games/${gameId}/rematch/`);

export const acceptRematch = (gameId) => api.post(`/games/${gameId}/rematch/accept/`);

export const rejectRematch = (gameId) => api.post(`/games/${gameId}/rematch/reject/`);

export const cancelRematch = (gameId) => api.post(`/games/${gameId}/rematch/cancel/`);

export const fetchClock = (gameId) => api.get(`/games/${gameId}/clock/`);

export const fetchGameAnalysis = (gameId) => api.get(`/games/${gameId}/analysis/`);

export const fetchGameAnalysisStatus = (gameId) =>
    api.get(`/games/${gameId}/analysis/request/`);

export const requestGameAnalysis = (gameId, payload = {}) =>
    api.post(`/games/${gameId}/analysis/full/`, payload);

export const createPrediction = (gameId, predicted_result) =>
    api.post(`/games/${gameId}/predict/`, { predicted_result });

export const fetchGameEvents = (gameId, since) =>
    api.get(`/games/${gameId}/events/${since ? `?since=${since}` : ''}`);

export const listTournaments = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/games/tournaments/${query ? `?${query}` : ''}`);
};

export const getTournament = (tournamentId) => api.get(`/games/tournaments/${tournamentId}/`);

export const registerTournament = (tournamentId, payload = {}) =>
    api.post(`/games/tournaments/${tournamentId}/register/`, payload);

export const unregisterTournament = (tournamentId) =>
    api.post(`/games/tournaments/${tournamentId}/unregister/`);

export const tournamentStandings = (tournamentId) =>
    api.get(`/games/tournaments/${tournamentId}/standings/`);

export const tournamentPairings = (tournamentId) =>
    api.get(`/games/tournaments/${tournamentId}/pairings/`);

export const tournamentMyGame = (tournamentId) =>
    api.get(`/games/tournaments/${tournamentId}/my-game/`);

export const enqueueMatchmaking = (time_control) =>
    api.post('/games/matchmaking/enqueue/', { time_control });

export const cancelMatchmaking = (time_control) =>
    api.post('/games/matchmaking/cancel/', time_control ? { time_control } : {});

export const queueStatus = () => api.get('/games/matchmaking/status/');

export const listBots = (mode = 'blitz') => api.get(`/games/bots/?mode=${mode}`);

export const createBotGame = (botId, payload = {}) =>
    api.post('/games/bots/create-game/', { bot_id: botId, ...payload });

export const fetchRatingHistory = (username, mode = 'blitz', params = {}) => {
    const query = new URLSearchParams({ mode, ...params }).toString();
    return api.get(`/public/accounts/${username}/rating-history/?${query}`);
};

export const fetchUserGames = (username, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/games/user/${username}/${query ? `?${query}` : ''}`);
};

export const fetchPublicAccount = (username) =>
    api.get(`/public/accounts/${username}/`);

export const searchPublicUsers = (search, params = {}) => {
    const query = new URLSearchParams({ search, ...params }).toString();
    return api.get(`/public/accounts/?${query}`);
};

export const sendFriendRequest = (payload) => {
    if (payload && typeof payload === 'object') {
        return api.post('/social/friend-requests/', payload);
    }
    if (typeof payload === 'number') {
        return api.post('/social/friend-requests/', { to_user_id: payload });
    }
    if (typeof payload === 'string') {
        if (payload.includes('@')) {
            return api.post('/social/friend-requests/', { to_email: payload });
        }
        const numeric = Number(payload);
        if (Number.isFinite(numeric)) {
            return api.post('/social/friend-requests/', { to_user_id: numeric });
        }
    }
    return api.post('/social/friend-requests/', { to_email: payload });
};

export const getFriendRequests = () =>
    api.get('/social/friend-requests/');

export const respondFriendRequest = (requestId, decision) =>
    api.post(`/social/friend-requests/${requestId}/respond/`, { decision });

export const getFriends = () =>
    api.get('/social/friends/');

export const createThread = (participantId) =>
    api.post('/social/chat/threads/', { participant_id: participantId });

export const listThreads = () =>
    api.get('/social/chat/threads/');

export const getMessages = (threadId) =>
    api.get(`/social/chat/threads/${threadId}/messages/`);

export const sendMessage = (threadId, payload) =>
    api.post(`/social/chat/threads/${threadId}/messages/`, payload);

export const fetchNotifications = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/notifications/${query ? `?${query}` : ''}`);
};

export const fetchUnreadNotifications = () =>
    api.get('/notifications/unread-count/');

export const markNotificationsRead = (notificationId) =>
    api.post(`/notifications/${notificationId}/mark-read/`);

export const markAllNotificationsRead = () =>
    api.post('/notifications/mark-read/');

export const deleteNotification = (notificationId) =>
    api.del(`/notifications/${notificationId}/`);
