import { useSyncExternalStore } from "react";

const STORAGE_KEY = "polli.activeOrganizationId";

function readStoredId(): string | null {
    try {
        return sessionStorage.getItem(STORAGE_KEY);
    } catch {
        // sessionStorage can throw in locked-down environments (e.g. private
        // browsing in some browsers) — fall back to in-memory only.
        return null;
    }
}

let activeOrganizationId: string | null = readStoredId();
const listeners = new Set<() => void>();

export function getActiveOrganizationId(): string | null {
    return activeOrganizationId;
}

export function setActiveOrganizationId(organizationId: string | null): void {
    if (organizationId === activeOrganizationId) return;
    activeOrganizationId = organizationId;
    try {
        if (organizationId) {
            sessionStorage.setItem(STORAGE_KEY, organizationId);
        } else {
            sessionStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Ignore storage failures — the in-memory value is still updated.
    }
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useActiveOrganizationId(): string | null {
    return useSyncExternalStore(subscribe, getActiveOrganizationId);
}
