import { Button, Dialog, DialogFooter } from "@pollinations/ui";
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
        <Dialog
            open={!!agent}
            onOpenChange={(open) => !open && onCancel()}
            title="Delete Agent"
            size="sm"
        >
            <p className="flex-1 px-6 py-4">
                Delete this agent and its model registration? This cannot be
                undone.
            </p>
            <DialogFooter>
                <Button type="button" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" intent="danger" onClick={onConfirm}>
                    Delete
                </Button>
            </DialogFooter>
        </Dialog>
    );
}
