import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';

export default function NotFoundPage() {
    return (
        <Layout headerProps={{ title: "Not Found", segments: null, showBack: true }} showBottomNav={false}>
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-sm bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center">
                    <h2 className="text-xl font-bold mb-2">Page not found</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        The page you’re looking for doesn’t exist.
                    </p>
                    <Link
                        to="/"
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
                    >
                        Go home
                    </Link>
                </div>
            </div>
        </Layout>
    );
}
