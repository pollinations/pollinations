import { ConfirmationDialog } from "@pollinations/ui";
import type { ManagedAgent } from "./types.ts";

export function AgentDeleteConfirmation({
    agent,
    onConfirm,
    onCancel,
}: {
    agent: ManagedAgent | null;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}) {
    return (
        <ConfirmationDialog
            open={!!agent}
            title="Delete Agent"
            confirmLabel="Delete"
            pendingLabel="Deleting…"
            destructive
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <p>
                Delete this agent and its model registration? This cannot be
                undone.
            </p>
        </ConfirmationDialog>
    );
}
