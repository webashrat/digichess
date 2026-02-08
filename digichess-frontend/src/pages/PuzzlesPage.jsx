import React from 'react';
import Layout from '../components/layout/Layout';

export default function PuzzlesPage() {
    return (
        <Layout headerProps={{ title: "Puzzles", segments: null, showBack: false, rightAction: "notifications" }}>
            <div className="flex-1 overflow-y-auto p-4 pb-24 no-scrollbar">
                <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="material-symbols-outlined text-primary text-3xl">extension</span>
                        <h2 className="text-lg font-bold">Puzzles</h2>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        Daily puzzles will be added in the next iteration.
                    </p>
                    <button className="w-full bg-primary text-white font-semibold py-2.5 rounded-lg" type="button">
                        Explore Preview
                    </button>
                </div>
            </div>
        </Layout>
    );
}
