import { Button, Dialog, DialogBody, DialogFooter } from "@pollinations/ui";
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
            title="Delete model?"
            size="sm"
        >
            <DialogBody>
                <p className="text-sm leading-relaxed">
                    Delete{" "}
                    <span className="font-mono text-sm">
                        {endpoint?.modelId}
                    </span>
                    ? This removes the model and cannot be undone.
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
