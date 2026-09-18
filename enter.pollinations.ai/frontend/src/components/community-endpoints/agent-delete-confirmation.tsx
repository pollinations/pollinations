import { ConfirmationDialog } from "@pollinations/ui";
import type { ManagedAgent } from "./types.ts";

export function AgentDeleteConfirmation({
    agent,
    onConfirm,
    onCancel,
}: {
    agent: ManagedAgent | null;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <ConfirmationDialog
            open={!!agent}
            title="Delete agent?"
            description="Delete this agent and its model registration? This cannot be undone."
            confirmLabel="Delete"
            onConfirm={onConfirm}
            onCancel={onCancel}
        />
    );
}
