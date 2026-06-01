// Time-aware greeting in Eastern Time (America/New_York).
// Recalculates every minute.
import { useEffect, useState } from "react";

function etHour() {
    // Get the current hour in America/New_York regardless of viewer's local TZ.
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === "hour");
    return h ? parseInt(h.value, 10) : new Date().getHours();
}

function greetingFor(hour) {
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 22) return "Good evening";
    return "Late session";
}

export function useGreeting() {
    const [g, setG] = useState(() => greetingFor(etHour()));
    useEffect(() => {
        const id = setInterval(() => setG(greetingFor(etHour())), 60_000);
        return () => clearInterval(id);
    }, []);
    return g;
}
