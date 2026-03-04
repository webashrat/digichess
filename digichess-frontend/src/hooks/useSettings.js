import { useState, useEffect } from 'react';

const LOCAL_STORAGE_SOUND = 'soundEnabled';
const LOCAL_STORAGE_AUTO_QUEEN = 'autoQueenEnabled';
const LOCAL_STORAGE_UI_THEME = 'uiTheme';
const SETTINGS_CHANGE_EVENT = 'digichess-settings-change';

export default function useSettings() {
    const [uiTheme, setUiTheme] = useState(() => {
        if (typeof window === 'undefined') return 'dark';
        const stored = localStorage.getItem(LOCAL_STORAGE_UI_THEME);
        if (stored === 'light' || stored === 'dark') return stored;
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });

    const [boardThemeIndex, setBoardThemeIndex] = useState(() => {
        if (typeof window === 'undefined') return 6;
        const stored = Number(localStorage.getItem('boardTheme'));
        return Number.isFinite(stored) ? stored : 6;
    });

    const [pieceSet, setPieceSet] = useState(() => {
        if (typeof window === 'undefined') return 'cburnett';
        return localStorage.getItem('pieceSet') || 'cburnett';
    });

    const [soundEnabled, setSoundEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem(LOCAL_STORAGE_SOUND);
        return stored ? stored === 'true' : true;
    });

    const [autoQueenEnabled, setAutoQueenEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem(LOCAL_STORAGE_AUTO_QUEEN);
        return stored ? stored === 'true' : true;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('boardTheme', String(boardThemeIndex));
        }
    }, [boardThemeIndex]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('pieceSet', pieceSet);
        }
    }, [pieceSet]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_STORAGE_SOUND, String(soundEnabled));
            window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
                detail: { key: LOCAL_STORAGE_SOUND, value: String(soundEnabled) },
            }));
        }
    }, [soundEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        document.documentElement.classList.toggle('dark', uiTheme === 'dark');
        localStorage.setItem(LOCAL_STORAGE_UI_THEME, uiTheme);
    }, [uiTheme]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_STORAGE_AUTO_QUEEN, String(autoQueenEnabled));
            window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
                detail: { key: LOCAL_STORAGE_AUTO_QUEEN, value: String(autoQueenEnabled) },
            }));
        }
    }, [autoQueenEnabled]);

    return {
        uiTheme, setUiTheme,
        boardThemeIndex, setBoardThemeIndex,
        pieceSet, setPieceSet,
        soundEnabled, setSoundEnabled,
        autoQueenEnabled, setAutoQueenEnabled,
    };
}
