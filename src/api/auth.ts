import api from './client';
import { OTPState } from './types';

export const register = async (payload: {
  email: string;
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  country?: string;
}) => {
  const { data } = await api.post('/api/accounts/register/', payload);
  return data as OTPState;
};

export const verifyOTP = async (payload: { email: string; code: string; purpose?: string }) => {
  const { data } = await api.post('/api/accounts/verify-otp/', payload);
  return data;
};

export const resendOTP = async (payload: { email: string; purpose?: string }) => {
  const { data } = await api.post('/api/accounts/resend-otp/', payload);
  return data;
};

export const login = async (payload: { email?: string; username?: string; password: string }) => {
  const { data } = await api.post('/api/accounts/login/', payload);
  return data;
};

export const forgotPassword = async (payload: { email?: string; username?: string }) => {
  const { data } = await api.post('/api/accounts/forgot-password/', payload);
  return data;
};

export const resetPassword = async (payload: { email: string; code: string; new_password: string }) => {
  const { data } = await api.post('/api/accounts/reset-password/', payload);
  return data;
};

export const forgotUsername = async (payload: { email: string }) => {
  const { data } = await api.post('/api/accounts/forgot-username/', payload);
  return data;
};

export const verifyForgotOTP = async (payload: { email: string; code: string }) => {
  const { data } = await api.post('/api/accounts/verify-forgot-otp/', payload);
  return data;
};
