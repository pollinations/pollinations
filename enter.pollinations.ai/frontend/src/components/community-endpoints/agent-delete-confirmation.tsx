import { Button, Dialog } from "@pollinations/ui";
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
            contentClassName="p-6"
        >
            <p className="mb-6 mt-4">
                Delete <span className="font-medium">{agent?.name}</span>? Its
                Worker and dedicated API key will be removed. Registered agents
                must be unlisted first.
            </p>
            <div className="flex justify-end gap-2">
                <Button type="button" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" intent="danger" onClick={onConfirm}>
                    Delete
                </Button>
            </div>
        </Dialog>
    );
}
