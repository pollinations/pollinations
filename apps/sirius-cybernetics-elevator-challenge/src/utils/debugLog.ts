// Tiny pub/sub store holding the most recent Pollinations request/response so a
// debug panel can show exactly what was sent to the model. Recorded centrally in
// fetchFromPollinations, so every call (interactive, autonomous, passenger,
// guide) is captured without touching individual call sites.

import type { PollingsMessage } from "@/types";

export type DebugEntry = {
    model: string;
    reasoningEffort: string;
    messages: PollingsMessage[];
    response?: string;
    error?: string;
    at: number;
};

let lastEntry: DebugEntry | null = null;
const listeners = new Set<() => void>();

export const recordDebugRequest = (
    entry: Omit<DebugEntry, "at">,
): void => {
    lastEntry = { ...entry, at: Date.now() };
    for (const l of listeners) l();
};

export const getLastDebugEntry = (): DebugEntry | null => lastEntry;

export const subscribeDebug = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
