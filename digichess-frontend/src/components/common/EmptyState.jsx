import React from 'react';

export default function EmptyState({ icon = 'chess', title, message, action, onAction }) {
    return (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center animate-fade-in">
            <div className="size-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-slate-400 dark:text-slate-500">{icon}</span>
            </div>
            {title ? <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{title}</h3> : null}
            {message ? <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[240px]">{message}</p> : null}
            {action && onAction ? (
                <button
                    type="button"
                    className="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
                    onClick={onAction}
                >
                    {action}
                </button>
            ) : null}
        </div>
    );
}
