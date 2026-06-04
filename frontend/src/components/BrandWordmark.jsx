import React from "react";
import { BRAND_LOGO_WHITE, BRAND_NAME } from "../constants/brand";

const SIDEBAR_LOGO =
    "h-10 w-auto sm:h-10 md:h-12 lg:h-14 xl:h-16 block shrink-0 opacity-50";

const LOGIN_LOGO =
    "h-20 sm:h-24 w-auto mx-auto block shrink-0 eat-brand-logo-login max-w-[min(100%,18rem)]";

export function BrandWordmark({ variant = "login", className = "" }) {
    if (variant === "sidebar") {
        return (
            <img
                src={BRAND_LOGO_WHITE}
                alt={BRAND_NAME}
                className={`${SIDEBAR_LOGO} ${className}`}
            />
        );
    }

    if (variant === "login") {
        return (
            <img
                src={BRAND_LOGO_WHITE}
                alt={BRAND_NAME}
                className={`${LOGIN_LOGO} ${className}`}
            />
        );
    }

    return (
        <p className={`eat-brand-wordmark uppercase ${className}`}>
            {BRAND_NAME}.
        </p>
    );
}
