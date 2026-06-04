import React from "react";
import { Sun, Cloud, CloudSun, CloudRain, CloudLightning, CloudFog, CloudSnow } from "lucide-react";

/** WMO weather codes from Open-Meteo → lucide icon */
export function weatherIconForCode(code) {
    const c = Number(code);
    if (c === 0) return Sun;
    if (c === 1) return CloudSun;
    if (c === 2 || c === 3) return Cloud;
    if (c === 45 || c === 48) return CloudFog;
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return CloudRain;
    if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return CloudSnow;
    if (c >= 95) return CloudLightning;
    return Cloud;
}

export default function WeatherIcon({ code, size = 32, className = "text-paper shrink-0" }) {
    const Icon = weatherIconForCode(code);
    return <Icon size={size} strokeWidth={1.5} className={className} aria-hidden />;
}
