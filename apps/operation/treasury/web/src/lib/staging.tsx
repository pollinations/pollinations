import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useReducer,
} from "react";
import { appendRows } from "./write";

export type StagedChange = {
    id: string;
    // Stable identity of what is being edited (for example a transaction override key).
    // Staging the same key again replaces the pending change; editors use it
    // for per-row reset. Add-forms without a natural key get the random id.
    key: string;
    datasource: string;
    row: Record<string, unknown>;
    summary: string;
    hidden?: boolean;
};

export type StageInput = Omit<StagedChange, "id" | "key"> & {
    id?: string;
    key?: string;
};

export type StagingState = {
    changes: StagedChange[];
    committed: StagedChange[];
    committing: boolean;
    error: string | null;
    resetNonce: number;
};

export const initialStagingState: StagingState = {
    changes: [],
    committed: [],
    committing: false,
    error: null,
    resetNonce: 0,
};

type StagingAction =
    | { type: "stage"; change: StagedChange }
    | { type: "unstage"; key: string }
    | { type: "clear" }
    | { type: "commitStart" }
    | { type: "commitSuccess"; changes: StagedChange[] }
    | { type: "commitError"; error: string };

export function stagingReducer(
    state: StagingState,
    action: StagingAction,
): StagingState {
    switch (action.type) {
        case "stage": {
            const exists = state.changes.some(
                (change) => change.key === action.change.key,
            );
            const changes = exists
                ? state.changes.map((change) =>
                      change.key === action.change.key ? action.change : change,
                  )
                : [...state.changes, action.change];
            return {
                ...state,
                changes,
                committed: state.committed.filter(
                    (change) => change.key !== action.change.key,
                ),
                error: null,
            };
        }
        case "unstage":
            return {
                ...state,
                changes: state.changes.filter(
                    (change) => change.key !== action.key,
                ),
            };
        case "clear":
            return {
                ...state,
                changes: [],
                error: null,
                resetNonce: state.resetNonce + 1,
            };
        case "commitStart":
            return { ...state, committing: true, error: null };
        case "commitSuccess": {
            const committedKeys = new Set(
                action.changes.map((change) => change.key),
            );
            return {
                ...state,
                changes: [],
                committed: [
                    ...state.committed.filter(
                        (change) => !committedKeys.has(change.key),
                    ),
                    ...action.changes,
                ],
                committing: false,
                error: null,
            };
        }
        case "commitError":
            return { ...state, committing: false, error: action.error };
    }
}

export function rowsByDatasource(changes: StagedChange[]) {
    const grouped = new Map<string, object[]>();

    for (const change of changes) {
        const rows = grouped.get(change.datasource) ?? [];
        rows.push(change.row);
        grouped.set(change.datasource, rows);
    }

    return grouped;
}

type StagingContextValue = StagingState & {
    stage: (change: StageInput) => string;
    unstage: (key: string) => void;
    clear: () => void;
    commitAll: () => Promise<void>;
};

const StagingContext = createContext<StagingContextValue | null>(null);

function newId() {
    if (!globalThis.crypto?.randomUUID) {
        throw new Error("crypto.randomUUID is required");
    }
    return globalThis.crypto.randomUUID();
}

export function StagingProvider({
    children,
    fixtures,
    onCommitted,
}: {
    children: ReactNode;
    fixtures: boolean;
    onCommitted: (changes: StagedChange[]) => void;
}) {
    const [state, dispatch] = useReducer(stagingReducer, initialStagingState);

    const stage = useCallback((input: StageInput) => {
        const id = input.id ?? newId();
        const key = input.key ?? id;
        dispatch({ type: "stage", change: { ...input, id, key } });
        return id;
    }, []);

    const unstage = useCallback((key: string) => {
        dispatch({ type: "unstage", key });
    }, []);

    const clear = useCallback(() => {
        dispatch({ type: "clear" });
    }, []);

    const commitAll = useCallback(async () => {
        const count = state.changes.length;
        if (count === 0 || state.committing) return;
        const committedChanges = state.changes;

        dispatch({ type: "commitStart" });

        try {
            if (fixtures) {
                console.info("treasury fixtures commit", state.changes);
            } else {
                await Promise.all(
                    [...rowsByDatasource(state.changes)].map(
                        ([datasource, rows]) => appendRows(datasource, rows),
                    ),
                );
            }

            dispatch({ type: "commitSuccess", changes: committedChanges });
            onCommitted(committedChanges);
        } catch (caught) {
            dispatch({
                type: "commitError",
                error:
                    caught instanceof Error ? caught.message : String(caught),
            });
        }
    }, [fixtures, onCommitted, state.changes, state.committing]);

    const value = useMemo(
        () => ({
            ...state,
            stage,
            unstage,
            clear,
            commitAll,
        }),
        [clear, commitAll, stage, unstage, state],
    );

    return (
        <StagingContext.Provider value={value}>
            {children}
        </StagingContext.Provider>
    );
}

export function useStaging() {
    const context = useContext(StagingContext);
    if (!context) {
        throw new Error("useStaging must be used inside StagingProvider");
    }
    return context;
}
