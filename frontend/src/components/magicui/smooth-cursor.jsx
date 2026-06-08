import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";

const CURSOR_ACCENT = "#CBFF00";
const CURSOR_ENROLL = "#222";

/**
 * SmoothCursor — magicui-style smooth-trailing cursor.
 * Visible only on devices with a fine pointer (desktop). Hidden on touch
 * via CSS media query in index.css.
 */
export function SmoothCursor() {
    const { pathname } = useLocation();
    const fill = pathname.startsWith("/enroll") ? CURSOR_ENROLL : CURSOR_ACCENT;
    const [down, setDown] = useState(false);

    const x = useMotionValue(-100);
    const y = useMotionValue(-100);
    const spring = { damping: 28, stiffness: 320, mass: 0.45 };
    const sx = useSpring(x, spring);
    const sy = useSpring(y, spring);

    useEffect(() => {
        const move = (e) => {
            x.set(e.clientX);
            y.set(e.clientY);
        };
        const onDown = () => setDown(true);
        const onUp = () => setDown(false);
        window.addEventListener("mousemove", move, { passive: true });
        window.addEventListener("mousedown", onDown);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("mouseup", onUp);
        };
    }, [x, y]);

    return (
        <motion.div
            aria-hidden
            style={{ translateX: sx, translateY: sy }}
            className="smooth-cursor pointer-events-none fixed top-0 left-0 z-[9999]"
        >
            <motion.svg
                animate={{ scale: down ? 0.85 : 1 }}
                transition={{ type: "spring", damping: 18, stiffness: 320 }}
                width="22"
                height="22"
                viewBox="0 0 22 22"
                fill="none"
                style={{ display: "block", transform: "translate(-2px,-2px)" }}
            >
                <path d="M3 2.6 L18.5 11 L11.2 12.6 L9 19.4 Z" fill={fill} />
            </motion.svg>
        </motion.div>
    );
}
