export type RunState<T> = {
    /** The last result, kept until the next run replaces or clears it. */
    result: T | null;
    /** The tab whose run is in flight, or null when idle. */
    running: string | null;
    error: string | null;
};

/**
 * The run's state lives here, not in a component, so a run started before
 * the visitor left the page still lands on whatever instance is mounted
 * when it finishes. A blob URL is revoked once its result is replaced or
 * cleared.
 */
export function createRunStore<T extends { type: string; url?: string }>() {
    let state: RunState<T> = { result: null, running: null, error: null };
    const listeners = new Set<() => void>();

    return {
        get: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        set(patch: Partial<RunState<T>>) {
            const previousUrl = state.result?.url;
            state = { ...state, ...patch };
            for (const listener of listeners) listener();
            if (previousUrl && previousUrl !== state.result?.url)
                URL.revokeObjectURL(previousUrl);
        },
    };
}
