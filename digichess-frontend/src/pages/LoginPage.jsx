import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, loading, error } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [localError, setLocalError] = useState(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLocalError(null);
        try {
            await login(identifier.trim(), password);
            navigate('/', { replace: true });
        } catch (err) {
            setLocalError(err?.message || 'Login failed');
        }
    };

    return (
        <Layout showHeader={false} showBottomNav={false}>
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-sm bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-1">Sign in</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        Use your username or email.
                    </p>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-500">Username or Email</span>
                            <input
                                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                value={identifier}
                                onChange={(event) => setIdentifier(event.target.value)}
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-500">Password</span>
                            <input
                                type="password"
                                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                            />
                        </label>
                        {(localError || error) ? (
                            <div className="text-sm text-red-500">{localError || error}</div>
                        ) : null}
                        <button
                            type="submit"
                            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
                            disabled={loading}
                        >
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>
                    <div className="mt-4 text-sm text-slate-500 text-center">
                        Don’t have an account?{' '}
                        <Link className="text-primary font-semibold hover:underline" to="/signup">
                            Sign up
                        </Link>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
