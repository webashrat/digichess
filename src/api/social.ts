import api from './client';

export const getFriends = async () => {
  const { data } = await api.get('/api/social/friends/');
  return data as { results?: any[] } | any[];
};

export const getFriendRequests = async () => {
  const { data } = await api.get('/api/social/friend-requests/');
  return data as { incoming: any[]; outgoing: any[] };
};

export const respondFriendRequest = async (id: number, decision: 'accept' | 'decline') => {
  const { data } = await api.post(`/api/social/friend-requests/${id}/respond/`, { decision });
  return data;
};

export const createThread = async (participant_id: number) => {
  const { data } = await api.post('/api/social/chat/threads/', { participant_id });
  return data;
};

export const listThreads = async () => {
  const { data } = await api.get('/api/social/chat/threads/');
  return data as any[];
};

export const getMessages = async (threadId: number) => {
  const { data } = await api.get(`/api/social/chat/threads/${threadId}/messages/`);
  return data as any[];
};

export const sendMessage = async (
  threadId: number,
  payload: { content?: string; attachment?: File | null }
) => {
  const form = new FormData();
  if (payload.content) form.append('content', payload.content);
  if (payload.attachment) form.append('attachment', payload.attachment);
  const { data } = await api.post(`/api/social/chat/threads/${threadId}/messages/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
};

export const sendFriendRequest = async (to_email: string) => {
  const { data } = await api.post('/api/social/friend-requests/', { to_email });
  return data;
};
