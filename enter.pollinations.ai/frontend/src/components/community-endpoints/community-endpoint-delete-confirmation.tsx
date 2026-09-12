import { ConfirmationDialog } from "@pollinations/ui";
import type { CommunityEndpoint } from "./types.ts";

type CommunityEndpointDeleteConfirmationProps = {
    endpoint: CommunityEndpoint | null;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
};

export function CommunityEndpointDeleteConfirmation({
    endpoint,
    onConfirm,
    onCancel,
}: CommunityEndpointDeleteConfirmationProps) {
    return (
        <ConfirmationDialog
            open={!!endpoint}
            title={
                endpoint?.type === "endpoint_agent"
                    ? "Delete Agent"
                    : "Delete Model"
            }
            confirmLabel="Delete"
            pendingLabel="Deleting…"
            destructive
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <p>
                Delete{" "}
                <span className="font-mono text-sm">{endpoint?.modelId}</span>?
                This removes the{" "}
                {endpoint?.type === "endpoint_agent" ? "agent" : "model"} and
                cannot be undone.
            </p>
        </ConfirmationDialog>
    );
}
