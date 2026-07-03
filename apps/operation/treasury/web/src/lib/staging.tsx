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
    datasource: string;
    row: Record<string, unknown>;
    summary: string;
};

export type StageInput = Omit<StagedChange, "id"> & { id?: string };

export type StagingState = {
    changes: StagedChange[];
    committing: boolean;
    error: string | null;
};

export const initialStagingState: StagingState = {
    changes: [],
    committing: false,
    error: null,
};

type StagingAction =
    | { type: "stage"; change: StagedChange }
    | { type: "discard"; id: string }
    | { type: "commitStart" }
    | { type: "commitSuccess" }
    | { type: "commitError"; error: string };

export function stagingReducer(
    state: StagingState,
    action: StagingAction,
): StagingState {
    switch (action.type) {
        case "stage":
            return {
                ...state,
                changes: [...state.changes, action.change],
                error: null,
            };
        case "discard":
            return {
                ...state,
                changes: state.changes.filter(
                    (change) => change.id !== action.id,
                ),
            };
        case "commitStart":
            return { ...state, committing: true, error: null };
        case "commitSuccess":
            return { changes: [], committing: false, error: null };
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
    discard: (id: string) => void;
    commitAll: () => Promise<void>;
};

const StagingContext = createContext<StagingContextValue | null>(null);

function newId() {
    return (
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    );
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
        dispatch({ type: "stage", change: { ...input, id } });
        return id;
    }, []);

    const discard = useCallback((id: string) => {
        dispatch({ type: "discard", id });
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

            dispatch({ type: "commitSuccess" });
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
            discard,
            commitAll,
        }),
        [commitAll, discard, stage, state],
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
