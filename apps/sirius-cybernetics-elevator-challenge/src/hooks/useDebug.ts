// Debug-mode plumbing for the API debug panel: a toggle (enabled by ?debug in
// the URL, flipped with Ctrl+D) and a live subscription to the last request.

import { useEffect, useState } from "react";
import {
    type DebugEntry,
    getLastDebugEntry,
    subscribeDebug,
} from "@/utils/debugLog";

export function useDebugMode() {
    const [enabled, setEnabled] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).has("debug");
        } catch {
            return false;
        }
    });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
                e.preventDefault();
                setEnabled((v) => !v);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return { enabled, toggle: () => setEnabled((v) => !v) };
}

// Subscribe to the most recent captured request/response.
export function useLastDebugEntry(): DebugEntry | null {
    const [entry, setEntry] = useState<DebugEntry | null>(getLastDebugEntry);
    useEffect(() => subscribeDebug(() => setEntry(getLastDebugEntry())), []);
    return entry;
}
