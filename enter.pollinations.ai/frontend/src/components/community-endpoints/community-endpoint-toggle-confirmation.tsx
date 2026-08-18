import { Button, Dialog } from "@pollinations/ui";
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
            title={endpoint?.disabled ? "Relist Model" : "Hide Model"}
            size="sm"
            contentClassName="p-6"
        >
            <p className="mb-6 mt-4">
                {endpoint?.disabled ? "Relist" : "Hide"}{" "}
                <span className="font-mono text-sm">{endpoint?.modelId}</span>?{" "}
                {endpoint?.disabled
                    ? "It will appear in model listings again."
                    : "It will be removed from model listings but remain callable by its exact model ID."}
            </p>
            <div className="flex justify-end gap-2">
                <Button type="button" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    intent={endpoint?.disabled ? "info" : "danger"}
                    onClick={onConfirm}
                >
                    {endpoint?.disabled ? "Relist" : "Hide"}
                </Button>
            </div>
        </Dialog>
    );
}
