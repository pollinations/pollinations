import { Button } from "@pollinations/ui";
import { ResourceDialog } from "../layout/resource-dialog.tsx";
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
        <ResourceDialog
            open={!!agent}
            onOpenChange={(open) => !open && onCancel()}
            title="Delete Agent"
            size="sm"
            contentClassName="p-6"
        >
            <p className="mb-6 mt-4">
                Delete this agent and its model registration? This cannot be
                undone.
            </p>
            <div className="flex justify-end gap-2">
                <Button type="button" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" intent="danger" onClick={onConfirm}>
                    Delete
                </Button>
            </div>
        </ResourceDialog>
    );
}
