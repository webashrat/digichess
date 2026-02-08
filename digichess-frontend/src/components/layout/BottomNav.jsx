import React from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';

export default function BottomNav() {
    const { user } = useAuth();
    const avatarUrl = user?.profile_pic || user?.avatar || user?.image || '';
    const navItems = [
        { id: 'home', to: '/', icon: 'home', label: 'Home', end: true },
        { id: 'play', to: '/play', icon: 'swords', label: 'Play' },
        { id: 'social', to: '/leaderboard', icon: 'groups', label: 'Social' },
        { id: 'tournaments', to: '/tournaments', icon: 'trophy', label: 'Tournaments' },
        {
            id: 'profile',
            to: user ? '/profile' : '/login',
            icon: 'person',
            label: user ? 'Profile' : 'Login',
            isProfile: Boolean(user),
        },
    ];
    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe z-50">
            <div className="flex justify-around items-center h-16 px-2">
                {navItems.map((item) => (
                    <NavLink
                        key={item.id}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) => clsx(
                            "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors",
                            isActive
                                ? "text-primary dark:text-primary"
                                : "text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary"
                        )}
                    >
                        {({ isActive }) => (
                            <>
                                {item.isProfile && avatarUrl ? (
                                    <div className={clsx(
                                        "w-6 h-6 rounded-full overflow-hidden",
                                        isActive ? "ring-2 ring-primary" : "bg-slate-300 dark:bg-slate-700"
                                    )}>
                                        <img src={avatarUrl} alt="Profile avatar" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <span
                                        className="material-symbols-outlined text-[24px]"
                                        style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                                    >
                                        {item.icon}
                                    </span>
                                )}
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
