import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BOARD_THEMES, PIECE_SETS } from '../../utils/boardPresets';
import { getBlitzTag, getRatingTagClasses } from '../../utils/ratingTags';

export default function ProfileMenu({ settings }) {
    const { user, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const panelRef = useRef(null);

    const avatarUrl = user?.profile_pic || user?.avatar || user?.image || '';
    const initials = user?.username?.slice(0, 2).toUpperCase() || 'DC';
    const blitzTag = getBlitzTag(user?.rating_blitz);
    const boardTheme = BOARD_THEMES[settings.boardThemeIndex] || BOARD_THEMES[6] || BOARD_THEMES[0];

    useEffect(() => {
        if (!open) return;
        const handleOutside = (event) => {
            if (buttonRef.current?.contains(event.target)) return;
            if (panelRef.current?.contains(event.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('touchstart', handleOutside);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('touchstart', handleOutside);
        };
    }, [open]);

    if (!isAuthenticated) {
        return (
            <div className="flex items-center gap-1.5">
                <button
                    className="h-8 sm:h-9 px-3 rounded-full bg-primary text-white text-[11px] sm:text-xs font-semibold shadow-sm hover:bg-blue-600 transition-colors active:scale-95"
                    type="button"
                    onClick={() => navigate('/login')}
                >
                    Sign in
                </button>
                <button
                    className="h-8 sm:h-9 px-3 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] sm:text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors active:scale-95"
                    type="button"
                    onClick={() => navigate('/signup')}
                >
                    Sign up
                </button>
            </div>
        );
    }

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                className="flex items-center gap-1.5 rounded-full pl-0.5 pr-1 sm:pr-2 py-0.5 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-label="Profile menu"
            >
                <div className="relative">
                    <div
                        className={`rounded-full size-8 sm:size-9 border-2 border-primary/80 shadow-sm ${avatarUrl ? 'bg-cover bg-center' : 'bg-slate-700 flex items-center justify-center text-[10px] sm:text-xs font-bold text-white'}`}
                        style={avatarUrl ? { backgroundImage: `url('${avatarUrl}')` } : undefined}
                    >
                        {!avatarUrl ? initials : null}
                    </div>
                    <div className="absolute bottom-0 right-0 size-2.5 bg-accent-green-bright rounded-full border-2 border-white dark:border-slate-900"></div>
                </div>
                <span className="hidden md:block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 max-w-[100px] truncate">
                    {user?.username}
                </span>
                <span className="material-symbols-outlined text-[16px] text-slate-400 hidden md:block">
                    {open ? 'expand_less' : 'expand_more'}
                </span>
            </button>

            {open ? (
                <div
                    ref={panelRef}
                    className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl bg-surface-light dark:bg-[#1a2335] border border-slate-200 dark:border-slate-700/80 shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-72 no-scrollbar"
                >
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700/60">
                        <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                                <div
                                    className={`rounded-full size-11 border-2 border-primary/80 ${avatarUrl ? 'bg-cover bg-center' : 'bg-slate-700 flex items-center justify-center text-sm font-bold text-white'}`}
                                    style={avatarUrl ? { backgroundImage: `url('${avatarUrl}')` } : undefined}
                                >
                                    {!avatarUrl ? initials : null}
                                </div>
                                <div className="absolute bottom-0 right-0 size-3 bg-accent-green-bright rounded-full border-2 border-surface-light dark:border-[#1a2335]"></div>
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{user?.username}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="material-symbols-outlined text-yellow-500 text-[14px]">bolt</span>
                                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{user?.rating_blitz || 800}</span>
                                    {blitzTag ? (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(blitzTag)}`}>
                                            {blitzTag}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="py-1 border-b border-slate-200 dark:border-slate-700/60">
                        <button
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                            onClick={() => { navigate('/profile'); setOpen(false); }}
                        >
                            <span className="material-symbols-outlined text-[20px] text-green-500">person</span>
                            Profile
                        </button>
                        <button
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                            onClick={() => { navigate('/messages'); setOpen(false); }}
                        >
                            <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">mail</span>
                            Messages
                        </button>
                    </div>

                    <div className="p-4 space-y-3 border-b border-slate-200 dark:border-slate-700/60">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <span className="material-symbols-outlined text-[18px]">palette</span>
                                Theme
                            </div>
                            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <button
                                    type="button"
                                    className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${settings.uiTheme === 'light' ? 'bg-primary text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    onClick={() => settings.setUiTheme('light')}
                                >
                                    Light
                                </button>
                                <button
                                    type="button"
                                    className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${settings.uiTheme === 'dark' ? 'bg-primary text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    onClick={() => settings.setUiTheme('dark')}
                                >
                                    Dark
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <div className="grid grid-cols-2 grid-rows-2 w-[18px] h-[18px] rounded-sm overflow-hidden border border-slate-300 dark:border-slate-600">
                                    <div style={{ backgroundColor: boardTheme.light }} />
                                    <div style={{ backgroundColor: boardTheme.dark }} />
                                    <div style={{ backgroundColor: boardTheme.dark }} />
                                    <div style={{ backgroundColor: boardTheme.light }} />
                                </div>
                                Board
                            </div>
                            <select
                                value={settings.boardThemeIndex}
                                onChange={(e) => settings.setBoardThemeIndex(Number(e.target.value))}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 max-w-[120px]"
                            >
                                {BOARD_THEMES.map((theme, idx) => (
                                    <option key={theme.name} value={idx}>{theme.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <span className="material-symbols-outlined text-[18px]">extension</span>
                                Pieces
                            </div>
                            <select
                                value={settings.pieceSet}
                                onChange={(e) => settings.setPieceSet(e.target.value)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 max-w-[120px]"
                            >
                                {PIECE_SETS.map((set) => (
                                    <option key={set.value} value={set.value}>{set.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <span className="material-symbols-outlined text-[18px]">{settings.soundEnabled ? 'volume_up' : 'volume_off'}</span>
                                Sound
                            </div>
                            <button
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${settings.soundEnabled ? 'bg-primary/15 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                                type="button"
                                onClick={() => settings.setSoundEnabled(!settings.soundEnabled)}
                            >
                                {settings.soundEnabled ? 'On' : 'Off'}
                            </button>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                                Auto queen
                            </div>
                            <button
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${settings.autoQueenEnabled ? 'bg-primary/15 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                                type="button"
                                onClick={() => settings.setAutoQueenEnabled(!settings.autoQueenEnabled)}
                            >
                                {settings.autoQueenEnabled ? 'On' : 'Off'}
                            </button>
                        </div>
                    </div>

                    <div className="py-1">
                        <button
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            onClick={() => { logout(); setOpen(false); }}
                        >
                            <span className="material-symbols-outlined text-[20px]">logout</span>
                            Sign out
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
