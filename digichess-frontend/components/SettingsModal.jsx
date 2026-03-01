'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { BOARD_THEMES, PIECE_SETS } from '@/utils/boardPresets';

const STORAGE_KEYS = {
    boardTheme: 'digichess_board_theme',
    pieceSet: 'digichess_piece_set',
    sound: 'digichess_sound',
    autoQueen: 'digichess_auto_queen',
};

function getStored(key, fallback) {
    if (typeof window === 'undefined') return fallback;
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
}

export default function SettingsModal({ open, onClose }) {
    const overlayRef = useRef(null);
    const [boardTheme, setBoardTheme] = useState('Classic');
    const [pieceSet, setPieceSet] = useState('cburnett');
    const [sound, setSound] = useState(true);
    const [autoQueen, setAutoQueen] = useState(true);

    useEffect(() => {
        setBoardTheme(getStored(STORAGE_KEYS.boardTheme, 'Classic'));
        setPieceSet(getStored(STORAGE_KEYS.pieceSet, 'cburnett'));
        setSound(getStored(STORAGE_KEYS.sound, 'true') === 'true');
        setAutoQueen(getStored(STORAGE_KEYS.autoQueen, 'true') === 'true');
    }, [open]);

    const update = (key, val, setter) => {
        setter(val);
        localStorage.setItem(key, String(val));
        window.dispatchEvent(new CustomEvent('digichess-settings-changed', { detail: { key, value: val } }));
    };

    const handleOverlayClick = (e) => {
        if (e.target === overlayRef.current) onClose();
    };

    useEffect(() => {
        if (!open) return;
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [open, onClose]);

    if (!open) return null;

    const currentTheme = BOARD_THEMES.find((t) => t.name === boardTheme) || BOARD_THEMES[0];

    return createPortal(
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[100] flex items-start justify-end bg-black/20 backdrop-blur-[2px]"
            onClick={handleOverlayClick}
        >
            <div className="mt-14 mr-4 w-72 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Settings</h3>
                    <button
                        type="button"
                        className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                        onClick={onClose}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 space-y-5">
                    {/* Board theme */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 block">Board theme</label>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 grid grid-cols-2 grid-rows-2 border border-slate-200 dark:border-slate-700">
                                <div style={{ backgroundColor: currentTheme.light }} />
                                <div style={{ backgroundColor: currentTheme.dark }} />
                                <div style={{ backgroundColor: currentTheme.dark }} />
                                <div style={{ backgroundColor: currentTheme.light }} />
                            </div>
                            <select
                                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
                                value={boardTheme}
                                onChange={(e) => update(STORAGE_KEYS.boardTheme, e.target.value, setBoardTheme)}
                            >
                                {BOARD_THEMES.map((t) => (
                                    <option key={t.name} value={t.name}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Piece set */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 block">Piece set</label>
                        <select
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
                            value={pieceSet}
                            onChange={(e) => update(STORAGE_KEYS.pieceSet, e.target.value, setPieceSet)}
                        >
                            {PIECE_SETS.map((p) => (
                                <option key={p.value} value={p.value}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sound toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Sound</span>
                        <button
                            type="button"
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${sound ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                            onClick={() => update(STORAGE_KEYS.sound, !sound, setSound)}
                        >
                            {sound ? 'Enabled' : 'Disabled'}
                        </button>
                    </div>

                    {/* Auto queen toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Auto queen</span>
                        <button
                            type="button"
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${autoQueen ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                            onClick={() => update(STORAGE_KEYS.autoQueen, !autoQueen, setAutoQueen)}
                        >
                            {autoQueen ? 'Enabled' : 'Disabled'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
