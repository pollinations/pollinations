import { Button, Dialog, DialogFooter } from "@pollinations/ui";
import type { CommunityEndpoint } from "./types.ts";

type CommunityEndpointToggleConfirmationProps = {
    endpoint: CommunityEndpoint | null;
    onConfirm: () => void;
    onCancel: () => void;
};

export function CommunityEndpointToggleConfirmation({
    endpoint,
    onConfirm,
    onCancel,
}: CommunityEndpointToggleConfirmationProps) {
    return (
        <Dialog
            open={!!endpoint}
            onOpenChange={(open) => !open && onCancel()}
            title={endpoint?.hidden ? "Relist Model" : "Hide Model"}
            size="sm"
        >
            <p className="flex-1 px-6 py-4">
                {endpoint?.hidden ? "Relist" : "Hide"}{" "}
                <span className="font-mono text-sm">{endpoint?.modelId}</span>?{" "}
                {endpoint?.hidden
                    ? "It will appear in model listings again."
                    : "It will be removed from model listings but remain callable by its exact model ID."}
            </p>
            <DialogFooter>
                <Button type="button" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    intent={endpoint?.hidden ? "info" : "danger"}
                    onClick={onConfirm}
                >
                    {endpoint?.hidden ? "Relist" : "Hide"}
                </Button>
            </DialogFooter>
        </Dialog>
    );
}
