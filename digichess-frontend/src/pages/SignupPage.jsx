import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import CountrySelect from '../components/common/CountrySelect';
import { registerAccount, verifyOtp, resendOtp } from '../api';
import { useAuth } from '../context/AuthContext';

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

const readImageAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
});

const initialForm = {
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    country: 'INTL',
    profilePic: '',
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

    const handleProfilePicChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const type = file.type?.toLowerCase();
        const validType = type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png';
        if (!validType) {
            setError('Profile picture must be JPG or PNG.');
            return;
        }
        if (file.size > MAX_PROFILE_IMAGE_BYTES) {
            setError('Profile picture must be smaller than 2 MB.');
            return;
        }
        try {
            const dataUrl = await readImageAsDataUrl(file);
            setForm((prev) => ({ ...prev, profilePic: String(dataUrl || '') }));
            setError(null);
        } catch (err) {
            setError('Could not process profile picture.');
        }
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
            if (form.profilePic) payload.profile_pic = form.profilePic;
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
                            <div>
                                <span className="text-xs font-semibold text-slate-500">Profile picture</span>
                                <div className="mt-2 flex items-center gap-3">
                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">
                                        {form.profilePic ? (
                                            <img src={form.profilePic} alt="Profile preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <span>
                                                {(form.username.trim() || form.firstName.trim() || 'U').slice(0, 2).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <input
                                            id="signupProfilePic"
                                            type="file"
                                            accept="image/png,image/jpeg"
                                            className="hidden"
                                            onChange={handleProfilePicChange}
                                        />
                                        <label
                                            htmlFor="signupProfilePic"
                                            className="inline-flex px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark text-xs font-semibold cursor-pointer hover:border-primary/50"
                                        >
                                            Upload image
                                        </label>
                                        {form.profilePic ? (
                                            <button
                                                type="button"
                                                className="ml-2 text-xs font-semibold text-slate-500 hover:text-primary"
                                                onClick={() => setForm((prev) => ({ ...prev, profilePic: '' }))}
                                            >
                                                Remove
                                            </button>
                                        ) : (
                                            <p className="text-[11px] text-slate-500">JPG or PNG, up to 2 MB.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
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
                                <CountrySelect
                                    value={form.country}
                                    onChange={(value) => setForm((prev) => ({ ...prev, country: value }))}
                                    placeholder="Search country by name or code"
                                    showFlags={false}
                                    showCode
                                    searchable
                                />
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
