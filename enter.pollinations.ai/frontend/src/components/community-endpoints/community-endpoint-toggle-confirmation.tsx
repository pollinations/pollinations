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
            title={endpoint?.disabled ? "Reactivate Model" : "Deactivate Model"}
            size="sm"
            contentClassName="p-6"
        >
            <p className="mb-6 mt-4">
                {endpoint?.disabled ? "Reactivate" : "Deactivate"}{" "}
                <span className="font-mono text-sm">{endpoint?.modelId}</span>?
                {endpoint?.disabled
                    ? "It will be callable by users again."
                    : "It will stop responding but stays configured."}
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
                    {endpoint?.disabled ? "Reactivate" : "Deactivate"}
                </Button>
            </div>
        </Dialog>
    );
}
