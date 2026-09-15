import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { type LocalState, readState } from "./live-client";
import type { ReviewCase } from "./review-cases";
import { prepareReviewCase } from "./review-prepare";
import "./conditions.css";

type ConnectConditions = {
    state?: LocalState;
    revision: number;
    busy: boolean;
    restarting: boolean;
    error: string;
    restart: (recipe: ReviewCase) => Promise<boolean>;
    refresh: () => Promise<void>;
};

const ConditionsContext = createContext<ConnectConditions | null>(null);

export function ConnectConditionsProvider({ children }: PropsWithChildren) {
    const [state, setState] = useState<LocalState>();
    const [revision, setRevision] = useState(0);
    const [busy, setBusy] = useState(true);
    const [restarting, setRestarting] = useState(false);
    const [error, setError] = useState("");
    const writing = useRef(false);
    const request = useRef(0);
    const load = useCallback(async (recipe?: ReviewCase) => {
        if (writing.current) return false;
        const id = ++request.current;
        const write = recipe !== undefined;
        if (write) {
            writing.current = true;
            setBusy(true);
            setRestarting(Boolean(recipe));
        }
        setError("");
        try {
            if (recipe)
                await prepareReviewCase(recipe, (path, body) =>
                    fetch(path, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        ...(body !== undefined && {
                            body: JSON.stringify(body),
                        }),
                    }),
                );
            const next = await readState();
            if (id !== request.current) return false;
            setState(next);
            if (recipe) setRevision((value) => value + 1);
            return true;
        } catch (reason) {
            if (id === request.current)
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "Unable to read the local account.",
                );
            return false;
        } finally {
            if (write) writing.current = false;
            if (id === request.current) {
                setBusy(false);
                setRestarting(false);
            }
        }
    }, []);
    const refresh = useCallback(async () => {
        await load();
    }, [load]);
    useEffect(() => {
        void load();
    }, [load]);
    return (
        <ConditionsContext.Provider
            value={{
                state,
                revision,
                busy,
                restarting,
                error,
                restart: load,
                refresh,
            }}
        >
            {children}
        </ConditionsContext.Provider>
    );
}

export function useConnectConditions() {
    const value = useContext(ConditionsContext);
    if (!value) throw new Error("Connect conditions provider is missing");
    return value;
}
