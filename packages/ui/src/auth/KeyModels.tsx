import { useAuthKey, useAuthState } from "@pollinations_ai/sdk/react";
import { Chip } from "../primitives/Chip.tsx";

export type KeyModelsProps = { className?: string };

/** Renders the count of allowed models on the current key, or "All" when unrestricted. */
export function KeyModels({ className }: KeyModelsProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { key } = useAuthKey();
    if (!isLoggedIn || !key) return null;
    const models = key.permissions?.models ?? null;
    return (
        <Chip data-polli="key-models" className={className}>
            {models === null ? "All" : models.length}
        </Chip>
    );
}
