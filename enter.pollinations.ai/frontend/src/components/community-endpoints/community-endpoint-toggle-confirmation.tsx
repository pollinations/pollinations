import { Button, Dialog, DialogBody, DialogFooter } from "@pollinations/ui";
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
            title={`${endpoint?.hidden ? "Relist" : "Hide"} ${endpoint?.type === "endpoint_agent" ? "agent" : "model"}?`}
            size="sm"
        >
            <DialogBody>
                <p className="text-sm leading-relaxed">
                    {endpoint?.hidden ? "Relist" : "Hide"}{" "}
                    <span className="font-mono text-sm">
                        {endpoint?.modelId}
                    </span>
                    ?{" "}
                    {endpoint?.hidden
                        ? "It will appear in model listings again."
                        : "It will be removed from model listings but remain callable by its exact model ID."}
                </p>
            </DialogBody>
            <DialogFooter>
                <Button type="button" intent="neutral" onClick={onCancel}>
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
