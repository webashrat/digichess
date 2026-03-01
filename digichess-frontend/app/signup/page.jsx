'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, BadgeCheck, Eye, EyeOff } from 'lucide-react';
import { registerAccount, verifyOtp, resendOtp } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import CountrySelect from '@/components/common/CountrySelect';

const initialForm = { email: '', username: '', password: '', confirmPassword: '', firstName: '', lastName: '', country: '' };

export default function SignupPage() {
  const router = useRouter();
  const { applyAuth } = useAuth();
  const [step, setStep] = useState('form');
  const [form, setForm] = useState(initialForm);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const canSubmit = useMemo(() => form.email.trim() && form.username.trim() && form.password && form.confirmPassword, [form]);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!canSubmit) {
      setError('Please complete all required fields.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const payload = { email: form.email.trim(), username: form.username.trim(), password: form.password };
      if (form.firstName.trim()) payload.first_name = form.firstName.trim();
      if (form.lastName.trim()) payload.last_name = form.lastName.trim();
      if (form.country) payload.country = form.country;
      await registerAccount(payload);
      setStep('verify');
      setMessage(`We sent a 6-digit code to ${form.email.trim()}.`);
    } catch (err) {
      setError(err?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!otp.trim()) {
      setError('Enter the verification code.');
      return;
    }
    setVerifyLoading(true);
    try {
      const data = await verifyOtp(form.email.trim(), otp.trim());
      applyAuth(data);
      router.replace('/');
    } catch (err) {
      setError(err?.message || 'Verification failed.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setMessage(null);
    setResendLoading(true);
    try {
      await resendOtp(form.email.trim());
      setMessage(`A new code was sent to ${form.email.trim()}.`);
    } catch (err) {
      setError(err?.message || 'Failed to resend code.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="w-full max-w-md bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">{step === 'form' ? 'Create your account' : 'Verify your email'}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {step === 'form' ? 'Join DigiChess and start your first match.' : 'Enter the 6-digit code we emailed you.'}
            </p>
          </div>
          <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            {step === 'form' ? <UserPlus className="w-6 h-6" /> : <BadgeCheck className="w-6 h-6" />}
          </div>
        </div>
        <div className="flex gap-2 mb-6">
          <div className={`flex-1 h-1 rounded-full ${step === 'form' ? 'bg-primary' : 'bg-primary/40'}`} />
          <div className={`flex-1 h-1 rounded-full ${step === 'verify' ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`} />
        </div>

        {step === 'form' ? (
          <form className="space-y-4" onSubmit={handleRegister}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">First name</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value={form.firstName} onChange={handleChange('firstName')} placeholder="Optional" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">Last name</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value={form.lastName} onChange={handleChange('lastName')} placeholder="Optional" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Email</span>
              <input type="email" className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value={form.email} onChange={handleChange('email')} required />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Username</span>
              <input className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value={form.username} onChange={handleChange('username')} required />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Country</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 w-7 text-center">{form.country || '—'}</span>
                <div className="flex-1">
                  <CountrySelect value={form.country} onChange={(v) => setForm((p) => ({ ...p, country: v }))} />
                </div>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Password</span>
              <div className="relative mt-1">
                <input type={showPassword ? 'text' : 'password'} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-10 text-sm" value={form.password} onChange={handleChange('password')} required />
                <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Confirm password</span>
              <div className="relative mt-1">
                <input type={showConfirm ? 'text' : 'password'} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-10 text-sm" value={form.confirmPassword} onChange={handleChange('confirmPassword')} required />
                <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {message && <p className="text-sm text-green-500">{message}</p>}
            <button type="submit" className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleVerify}>
            <div className="rounded-xl bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary">
              {message || `Enter the code sent to ${form.email.trim()}.`}
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Verification code</span>
              <input className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-center tracking-[0.3em] text-lg font-semibold" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} inputMode="numeric" />
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60" disabled={verifyLoading}>
              {verifyLoading ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <div className="flex justify-between text-xs text-slate-500">
              <button type="button" className="hover:text-primary" onClick={() => setStep('form')}>Change email</button>
              <button type="button" className="hover:text-primary disabled:opacity-50" onClick={handleResend} disabled={resendLoading}>
                {resendLoading ? 'Resending...' : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          {step === 'form' ? (
            <>Already have an account? <Link href="/login" className="text-primary font-semibold hover:underline">Sign in</Link></>
          ) : (
            <Link href="/login" className="text-primary font-semibold hover:underline">Back to login</Link>
          )}
        </p>
      </div>
    </div>
  );
}
