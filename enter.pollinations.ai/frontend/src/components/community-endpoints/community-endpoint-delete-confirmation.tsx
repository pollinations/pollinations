import { ConfirmationDialog } from "@pollinations/ui";
import { ResourceConfirmationContent } from "./resource-confirmation-content.tsx";
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
    const kind = endpoint?.type === "endpoint_agent" ? "agent" : "model";
    return (
        <ConfirmationDialog
            open={!!endpoint}
            title={`Delete ${kind}?`}
            confirmLabel="Delete"
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <ResourceConfirmationContent resource={endpoint?.modelId}>
                This removes the {kind} and cannot be undone.
            </ResourceConfirmationContent>
        </ConfirmationDialog>
    );
}
