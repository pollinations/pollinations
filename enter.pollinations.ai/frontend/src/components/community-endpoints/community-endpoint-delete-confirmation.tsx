import { Button, Dialog, DialogFooter } from "@pollinations/ui";
import type { CommunityEndpoint } from "./types.ts";

type CommunityEndpointDeleteConfirmationProps = {
    endpoint: CommunityEndpoint | null;
    onConfirm: () => void;
    onCancel: () => void;
};

export function CommunityEndpointDeleteConfirmation({
    endpoint,
    onConfirm,
    onCancel,
}: CommunityEndpointDeleteConfirmationProps) {
    return (
        <Dialog
            open={!!endpoint}
            onOpenChange={(open) => !open && onCancel()}
            title="Delete Model"
            size="sm"
        >
            <p className="flex-1 px-6 py-4">
                Delete{" "}
                <span className="font-mono text-sm">{endpoint?.modelId}</span>?
                This removes the model and cannot be undone.
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
