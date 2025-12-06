import api from './client';
import { UserDetail } from './types';

export const fetchMe = async () => {
  const { data } = await api.get('/api/accounts/me/');
  return data as UserDetail;
};

export const updateMe = async (payload: Partial<UserDetail>) => {
  const { data } = await api.patch('/api/accounts/me/', payload);
  return data as UserDetail;
};

export const pingPresence = async () => {
  const { data } = await api.post('/api/accounts/ping/');
  return data;
};
