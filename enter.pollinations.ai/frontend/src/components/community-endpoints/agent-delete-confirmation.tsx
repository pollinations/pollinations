import { Button, Dialog, DialogBody, DialogFooter } from "@pollinations/ui";
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
            title="Delete agent?"
            size="sm"
        >
            <DialogBody>
                <p className="text-sm leading-relaxed">
                    Delete this agent and its model registration? This cannot be
                    undone.
                </p>
            </DialogBody>
            <DialogFooter>
                <Button type="button" intent="neutral" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" intent="danger" onClick={onConfirm}>
                    Delete
                </Button>
            </DialogFooter>
        </Dialog>
    );
}
