import { ConfirmationDialog } from "@pollinations/ui";
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
            description={
                <>
                    Delete{" "}
                    <span className="font-mono text-sm">
                        {endpoint?.modelId}
                    </span>
                    ? This removes the {kind} and cannot be undone.
                </>
            }
            confirmLabel="Delete"
            onConfirm={onConfirm}
            onCancel={onCancel}
        />
    );
}
