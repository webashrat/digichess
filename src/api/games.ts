import api from './client';
import { GameResult, Mode } from './types';

export const listPublicGames = async (params?: { status?: string; page_size?: number }) => {
  const { data } = await api.get('/api/games/public/', { params });
  return data;
};

export const spectateGame = async (id: string | number) => {
  const { data } = await api.get(`/api/games/${id}/spectate/`);
  return data;
};

export const fetchGameDetail = async (id: string | number) => {
  const { data } = await api.get(`/api/games/${id}/`);
  return data;
};

export const fetchClock = async (id: string | number) => {
  const { data } = await api.get(`/api/games/${id}/clock/`);
  return data as { white_time_left: number; black_time_left: number; last_move_at?: string; turn?: 'white' | 'black' };
};

export const predictResult = async (id: string | number, predicted_result: 'white' | 'black' | 'draw') => {
  const { data } = await api.post(`/api/games/${id}/predict/`, { predicted_result });
  return data;
};

export const finishGame = async (id: string | number, result: GameResult) => {
  const { data } = await api.post(`/api/games/${id}/finish/`, { result });
  return data;
};

export const offerDraw = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/offer-draw/`);
  return data;
};

export const respondDraw = async (id: string | number, decision: 'accept' | 'decline') => {
  const { data } = await api.post(`/api/games/${id}/respond-draw/`, { decision });
  return data;
};

export const resignGame = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/resign/`);
  return data;
};

export const acceptChallenge = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/accept/`);
  return data;
};

export const rejectChallenge = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/reject/`);
  return data;
};

export const rematch = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/rematch/`);
  return data;
};

export const rematchAccept = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/rematch/accept/`);
  return data;
};

export const rematchReject = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/rematch/reject/`);
  return data;
};

export const fetchPlayerStatus = async (id: string | number) => {
  const { data } = await api.get(`/api/games/${id}/player-status/`);
  return data;
};

export const makeMove = async (id: string | number, move: string) => {
  const { data } = await api.post(`/api/games/${id}/move/`, { move });
  return data;
};

export const claimDraw = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/claim-draw/`);
  return data;
};

export const fetchAnalysis = async (id: string | number) => {
  const { data } = await api.get(`/api/games/${id}/analysis/`);
  return data;
};

export const requestFullAnalysis = async (id: string | number) => {
  const { data } = await api.post(`/api/games/${id}/analysis/full/`);
  return data;
};

export const checkAnalysisStatus = async (id: string | number) => {
  const { data } = await api.get(`/api/games/${id}/analysis/request/`);
  return data;
};

export const listBots = async (mode: string = 'blitz') => {
  const { data } = await api.get('/api/games/bots/', { params: { mode } });
  return data;
};

export const createBotGame = async (botId: number, timeControl: string = 'blitz', preferredColor: 'white' | 'black' | 'auto' = 'auto', rated: boolean = false) => {
  const { data } = await api.post('/api/games/bots/create-game/', {
    bot_id: botId,
    time_control: timeControl,
    preferred_color: preferredColor,
    rated: rated
  });
  return data;
};
