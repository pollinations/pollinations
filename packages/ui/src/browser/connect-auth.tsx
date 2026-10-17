import {
    PolliProvider,
    type PolliProviderProps,
    type StorageAdapter,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { useEffect } from "react";

// Native storage events do not reach other roots in the same document.
const changes = new EventTarget();
function write(key: string, value: string | null) {
    const previous = window.sessionStorage.getItem(key);
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
    if (previous !== value) {
        changes.dispatchEvent(new CustomEvent(key, { detail: value }));
    }
}

const storage: StorageAdapter = {
    getItem: (key) => window.sessionStorage.getItem(key),
    setItem: write,
    removeItem: (key) => write(key, null),
};

function KeyBridge({
    appKey,
    onChange,
}: {
    appKey: string;
    onChange: (apiKey: string | null) => void;
}) {
    const { apiKey, isHydrated } = useAuthState();
    const { setApiKey } = useAuthActions();
    useEffect(() => {
        const key = `polli:${appKey}:token`;
        const sync = (event: Event) => {
            setApiKey((event as CustomEvent<string | null>).detail);
        };
        changes.addEventListener(key, sync);
        return () => changes.removeEventListener(key, sync);
    }, [appKey, setApiKey]);
    useEffect(() => {
        if (isHydrated) onChange(apiKey);
    }, [apiKey, isHydrated, onChange]);
    return null;
}

export function ConnectAuth({
    onChange,
    children,
    ...options
}: PolliProviderProps & { onChange: (apiKey: string | null) => void }) {
    return (
        <PolliProvider {...options} key={options.appKey} storage={storage}>
            <KeyBridge appKey={options.appKey} onChange={onChange} />
            {children}
        </PolliProvider>
    );
}
