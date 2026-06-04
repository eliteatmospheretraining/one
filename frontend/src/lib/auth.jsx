import React, { createContext, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
    const [coach, setCoach] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const t = getToken();
        if (!t) {
            setLoading(false);
            return;
        }
        api.get("/auth/me")
            .then((r) => setCoach(r.data))
            .catch(() => clearToken())
            .finally(() => setLoading(false));
    }, []);

    const signIn = (token, coachObj) => {
        setToken(token);
        setCoach(coachObj);
    };

    const signOut = () => {
        clearToken();
        setCoach(null);
        window.location.href = "/login";
    };

    const refreshCoach = async () => {
        const r = await api.get("/auth/me");
        setCoach(r.data);
        return r.data;
    };

    return (
        <AuthCtx.Provider value={{ coach, loading, signIn, signOut, refreshCoach }}>{children}</AuthCtx.Provider>
    );
}

export const useAuth = () => useContext(AuthCtx);
