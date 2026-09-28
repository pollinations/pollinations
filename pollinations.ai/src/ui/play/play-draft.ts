import { useEffect, useState } from "react";

type DraftPart = "chat" | "media";
type DraftValues = Record<string, string | number | boolean | null>;
export const PLAY_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_DRAFT_LENGTH = 128 * 1024;

function storageKey(part: DraftPart) {
    return `pollinations:play:${part}:v1`;
}

/** Only same-tab text/settings: no files, messages, URLs, or credentials. */
export function readPlayDraft<T extends DraftValues>(
    part: DraftPart,
    defaults: T,
): T {
    try {
        const raw = window.sessionStorage.getItem(storageKey(part));
        if (!raw || raw.length > MAX_DRAFT_LENGTH) return defaults;
        const saved = JSON.parse(raw);
        const age = Date.now() - saved.savedAt;
        if (!Number.isFinite(age) || age < 0 || age >= PLAY_DRAFT_TTL_MS)
            return defaults;
        const result = { ...defaults };
        for (const key of Object.keys(defaults) as Array<keyof T>) {
            const value = saved.values?.[key];
            const fallback = defaults[key];
            if (
                (fallback === null &&
                    (value === null || typeof value === "string")) ||
                (fallback !== null &&
                    typeof value === typeof fallback &&
                    (typeof value !== "number" || Number.isFinite(value)))
            )
                result[key] = value;
        }
        return result;
    } catch {
        return defaults;
    }
}

export function savePlayDraft(part: DraftPart, values: DraftValues): boolean {
    try {
        const serialized = JSON.stringify({ savedAt: Date.now(), values });
        if (serialized.length > MAX_DRAFT_LENGTH)
            throw new Error("Draft too large");
        window.sessionStorage.setItem(storageKey(part), serialized);
        return true;
    } catch {
        clearPlayDraft(part);
        return false;
    }
}

function clearPlayDraft(part: DraftPart) {
    try {
        window.sessionStorage.removeItem(storageKey(part));
    } catch {
        // Blocked storage must not prevent typing or signing in.
    }
}

export function useRememberPlayDraft(part: DraftPart, values: DraftValues) {
    const [saveFailed, setSaveFailed] = useState(false);
    const serialized = JSON.stringify(values);
    useEffect(() => {
        const save = () => savePlayDraft(part, JSON.parse(serialized));
        setSaveFailed(!save());
        // Covers every Connect entry point, including the shared account menu.
        window.addEventListener("pagehide", save);
        return () => window.removeEventListener("pagehide", save);
    }, [part, serialized]);
    return saveFailed;
}
