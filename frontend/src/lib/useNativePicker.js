import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px), (pointer: coarse)";

function subscribe(onStoreChange) {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onStoreChange);
    return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
    return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
    return false;
}

/** True on phones/tablets and other coarse-pointer devices — use native date/time inputs. */
export function useNativePicker() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
