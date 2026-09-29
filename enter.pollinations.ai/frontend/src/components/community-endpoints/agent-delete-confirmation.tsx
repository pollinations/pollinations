import { ConfirmationDialog } from "@pollinations/ui";
import { ResourceConfirmationContent } from "./resource-confirmation-content.tsx";
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
            confirmLabel="Delete"
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <ResourceConfirmationContent resource={agent?.title ?? agent?.name}>
                This removes the agent and its model registration and cannot be
                undone.
            </ResourceConfirmationContent>
        </ConfirmationDialog>
    );
}
