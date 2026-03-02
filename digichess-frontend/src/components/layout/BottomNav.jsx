import React from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';

export default function BottomNav() {
    const { user } = useAuth();
    const avatarUrl = user?.profile_pic || user?.avatar || user?.image || '';
    const navItems = [
        { id: 'home', to: '/', icon: 'home', label: 'Home', shortLabel: 'Home', end: true },
        { id: 'tournaments', to: '/tournaments', icon: 'trophy', label: 'Tournaments', shortLabel: 'Tourneys' },
        { id: 'quiz', to: '/quiz', icon: 'quiz', label: 'Quiz', shortLabel: 'Quiz' },
        { id: 'leaderboard', to: '/leaderboard', icon: 'leaderboard', label: 'Leaderboard', shortLabel: 'Ranks' },
        { id: 'social', to: '/messages', icon: 'groups', label: 'Social', shortLabel: 'Social' },
        {
            id: 'profile',
            to: user ? '/profile' : '/login',
            icon: 'person',
            label: user ? 'Profile' : 'Login',
            shortLabel: user ? 'Profile' : 'Login',
            isProfile: Boolean(user),
        },
    ];
    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 pb-safe bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-6 h-[58px] sm:h-[62px]">
                {navItems.map((item) => (
                    <NavLink
                        key={item.id}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) => clsx(
                            "flex flex-col items-center justify-center min-w-0 h-full px-0.5 gap-0.5 transition-colors",
                            isActive
                                ? "text-primary dark:text-primary"
                                : "text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary"
                        )}
                    >
                        {({ isActive }) => (
                            <>
                                {item.isProfile && avatarUrl ? (
                                    <div className={clsx(
                                        "w-5 h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden",
                                        isActive ? "ring-2 ring-primary" : "bg-slate-300 dark:bg-slate-700"
                                    )}>
                                        <img src={avatarUrl} alt="Profile avatar" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <span
                                        className="material-symbols-outlined text-[20px] sm:text-[21px] leading-none"
                                        style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                                    >
                                        {item.icon}
                                    </span>
                                )}
                                <span className="block md:hidden max-w-full truncate text-[8px] sm:text-[9px] leading-tight font-semibold">
                                    {item.shortLabel || item.label}
                                </span>
                                <span className="hidden md:block max-w-full truncate text-[9px] leading-tight font-semibold">
                                    {item.label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
