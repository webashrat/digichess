import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import CountrySelect from '../components/common/CountrySelect';
import { flagFor } from '../utils/countries';
import { registerAccount, verifyOtp, resendOtp } from '../api';
import { useAuth } from '../context/AuthContext';

const initialForm = {
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    country: '',
};

export default function SignupPage() {
    const navigate = useNavigate();
    const { applyAuth } = useAuth();
    const [step, setStep] = useState('form');
    const [form, setForm] = useState(initialForm);
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    const canSubmit = useMemo(() => (
        form.email.trim() && form.username.trim() && form.password && form.confirmPassword
    ), [form]);

    const handleChange = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

    const handleRegister = async (event) => {
        event.preventDefault();
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
            const payload = {
                email: form.email.trim(),
                username: form.username.trim(),
                password: form.password,
            };
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

    const handleVerify = async (event) => {
        event.preventDefault();
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
            navigate('/', { replace: true });
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
        <Layout showHeader={false} showBottomNav={false}>
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold">
                                {step === 'form' ? 'Create your account' : 'Verify your email'}
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {step === 'form'
                                    ? 'Join DigiChess and start your first match.'
                                    : 'Enter the 6-digit code we emailed you.'}
                            </p>
                        </div>
                        <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined">
                                {step === 'form' ? 'person_add' : 'verified'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                        <div className={`flex-1 h-1 rounded-full ${step === 'form' ? 'bg-primary' : 'bg-primary/40'}`} />
                        <div className={`flex-1 h-1 rounded-full ${step === 'verify' ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    </div>

                    {step === 'form' ? (
                        <form className="space-y-4" onSubmit={handleRegister}>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs font-semibold text-slate-500">First name</span>
                                    <input
                                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                        value={form.firstName}
                                        onChange={handleChange('firstName')}
                                        placeholder="Optional"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold text-slate-500">Last name</span>
                                    <input
                                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                        value={form.lastName}
                                        onChange={handleChange('lastName')}
                                        placeholder="Optional"
                                    />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Email</span>
                                <input
                                    type="email"
                                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                    value={form.email}
                                    onChange={handleChange('email')}
                                    required
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Username</span>
                                <input
                                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                    value={form.username}
                                    onChange={handleChange('username')}
                                    required
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Country</span>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg">
                                        {flagFor(form.country)}
                                    </div>
                                    <div className="flex-1">
                                        <CountrySelect value={form.country} onChange={(value) => setForm((prev) => ({ ...prev, country: value }))} />
                                    </div>
                                </div>
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Password</span>
                                <input
                                    type="password"
                                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                    value={form.password}
                                    onChange={handleChange('password')}
                                    required
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Confirm password</span>
                                <input
                                    type="password"
                                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                    value={form.confirmPassword}
                                    onChange={handleChange('confirmPassword')}
                                    required
                                />
                            </label>
                            {error ? <div className="text-sm text-red-500">{error}</div> : null}
                            {message ? <div className="text-sm text-green-500">{message}</div> : null}
                            <button
                                type="submit"
                                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
                                disabled={loading}
                            >
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
                                <input
                                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-center tracking-[0.3em] text-lg font-semibold focus:ring-2 focus:ring-primary"
                                    value={otp}
                                    onChange={(event) => setOtp(event.target.value)}
                                    maxLength={6}
                                    inputMode="numeric"
                                />
                            </label>
                            {error ? <div className="text-sm text-red-500">{error}</div> : null}
                            <button
                                type="submit"
                                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
                                disabled={verifyLoading}
                            >
                                {verifyLoading ? 'Verifying...' : 'Verify & Continue'}
                            </button>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                                <button
                                    type="button"
                                    className="hover:text-primary transition-colors"
                                    onClick={() => setStep('form')}
                                >
                                    Change email
                                </button>
                                <button
                                    type="button"
                                    className="hover:text-primary transition-colors disabled:opacity-50"
                                    onClick={handleResend}
                                    disabled={resendLoading}
                                >
                                    {resendLoading ? 'Resending...' : 'Resend code'}
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="mt-6 text-center text-sm text-slate-500">
                        {step === 'form' ? (
                            <>
                                Already have an account?{' '}
                                <Link className="text-primary font-semibold hover:underline" to="/login">
                                    Sign in
                                </Link>
                            </>
                        ) : (
                            <Link className="text-primary font-semibold hover:underline" to="/login">
                                Back to login
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
