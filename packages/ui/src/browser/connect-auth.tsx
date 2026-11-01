import {
    PolliProvider,
    type PolliProviderProps,
    useAuthState,
} from "@pollinations/sdk/react";
import { useEffect } from "react";

function KeyBridge({
    onChange,
}: {
    onChange: (apiKey: string | null) => void;
}) {
    const { apiKey, isHydrated } = useAuthState();
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
        <PolliProvider {...options} key={options.appKey}>
            <KeyBridge onChange={onChange} />
            {children}
        </PolliProvider>
    );
}
