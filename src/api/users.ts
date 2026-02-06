import api from './client';
import { AccountListItem, UserDetail } from './types';

export const fetchAccounts = async (params?: { page?: number; page_size?: number; search?: string; ordering?: string; online_only?: number }) => {
  const { data } = await api.get('/api/public/accounts/', { params });
  return data as { count: number; results: AccountListItem[] };
};

export const fetchAccountDetail = async (username: string) => {
  const { data } = await api.get(`/api/public/accounts/${username}/`);
  return data as UserDetail;
};
