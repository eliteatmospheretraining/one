import React from "react";
import { useAuth } from "../lib/auth";
import { Navigate, useLocation } from "react-router-dom";

export default function RequireAuth({ children }) {
    const { coach, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="font-heading text-2xl uppercase tracking-widest text-zinc-400">Loading…</div>
            </div>
        );
    }
    if (!coach) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return children;
}
