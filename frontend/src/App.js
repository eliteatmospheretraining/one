import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "./lib/auth";
import RequireAuth from "./components/RequireAuth";
import AppLayout from "./components/AppLayout";

import Login from "./pages/Login";
import CalendarPage from "./pages/CalendarPage";
import Roster from "./pages/Roster";
import Invoices from "./pages/Invoices";
import Settings from "./pages/Settings";
import SessionDetail from "./pages/SessionDetail";

export default function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <AuthProvider>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/verify" element={<Login />} />
                        <Route
                            path="/"
                            element={
                                <RequireAuth>
                                    <AppLayout>
                                        <CalendarPage />
                                    </AppLayout>
                                </RequireAuth>
                            }
                        />
                        <Route
                            path="/sessions/:id"
                            element={
                                <RequireAuth>
                                    <AppLayout>
                                        <SessionDetail />
                                    </AppLayout>
                                </RequireAuth>
                            }
                        />
                        <Route
                            path="/roster"
                            element={
                                <RequireAuth>
                                    <AppLayout>
                                        <Roster />
                                    </AppLayout>
                                </RequireAuth>
                            }
                        />
                        <Route
                            path="/invoices"
                            element={
                                <RequireAuth>
                                    <AppLayout>
                                        <Invoices />
                                    </AppLayout>
                                </RequireAuth>
                            }
                        />
                        <Route
                            path="/settings"
                            element={
                                <RequireAuth>
                                    <AppLayout>
                                        <Settings />
                                    </AppLayout>
                                </RequireAuth>
                            }
                        />
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
            <Toaster
                position="top-center"
                toastOptions={{
                    style: {
                        background: "#0A0A0A",
                        color: "#FFFFFF",
                        border: "2px solid #CCFF00",
                        borderRadius: 0,
                        fontFamily: "Manrope, sans-serif",
                        fontWeight: 700,
                    },
                }}
            />
        </div>
    );
}
