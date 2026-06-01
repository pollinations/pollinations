import { useAccountKey, useAuthState } from "@pollinations/sdk/react";
import { Chip } from "../../primitives/Chip.tsx";

export type KeyModelsProps = { className?: string };

/** Renders "All models" or "N models" for the current key. `null` until loaded. */
export function KeyModels({ className }: KeyModelsProps = {}) {
    const { isLoggedIn } = useAuthState();
    const { data: key } = useAccountKey({ enabled: isLoggedIn });
    if (!isLoggedIn || !key) return null;
    const models = key.permissions?.models ?? null;
    const text =
        models === null
            ? "All models"
            : `${models.length} model${models.length === 1 ? "" : "s"}`;
    return (
        <Chip data-polli="key-models" className={className}>
            {text}
        </Chip>
    );
}
