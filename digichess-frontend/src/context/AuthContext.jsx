import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStorage } from '../api/client';
import { fetchMe, login as loginRequest, logout as logoutRequest } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [token, setToken] = useState(tokenStorage.get());
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const applyAuth = useCallback((data) => {
        tokenStorage.set(data.token);
        setToken(data.token);
        setUser(data.user);
    }, []);

    useEffect(() => {
        const hydrate = async () => {
            if (!token) {
                setLoading(false);
                return;
            }
            try {
                const me = await fetchMe();
                setUser(me);
            } catch (err) {
                tokenStorage.clear();
                setToken(null);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        hydrate();
    }, [token]);

    const login = async (identifier, password) => {
        setLoading(true);
        setError(null);
        try {
            const data = await loginRequest(identifier, password);
            applyAuth(data);
            return data.user;
        } catch (err) {
            setError(err.message || 'Login failed');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        setLoading(true);
        setError(null);
        try {
            await logoutRequest();
        } catch (err) {
            // ignore API errors on logout
        } finally {
            tokenStorage.clear();
            setToken(null);
            setUser(null);
            setLoading(false);
        }
    };

    const value = useMemo(() => ({
        token,
        user,
        isAuthenticated: Boolean(token),
        loading,
        error,
        login,
        logout,
        setUser,
        applyAuth,
    }), [token, user, loading, error, applyAuth]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
}
