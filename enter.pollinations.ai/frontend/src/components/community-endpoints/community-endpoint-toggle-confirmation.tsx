import { ConfirmationDialog, EyeIcon } from "@pollinations/ui";
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
    const hidden = !!endpoint?.hidden;
    const action = hidden ? "Relist" : "Hide";
    const kind = endpoint?.type === "endpoint_agent" ? "agent" : "model";
    return (
        <ConfirmationDialog
            open={!!endpoint}
            title={`${action} ${kind}?`}
            description={
                <>
                    {action}{" "}
                    <span className="font-mono text-sm">
                        {endpoint?.modelId}
                    </span>
                    ?{" "}
                    {hidden
                        ? "It will appear in model listings again."
                        : "It will be removed from model listings but remain callable by its exact model ID."}
                </>
            }
            confirmLabel={action}
            intent={hidden ? "info" : "danger"}
            confirmIcon={<EyeIcon />}
            onConfirm={onConfirm}
            onCancel={onCancel}
        />
    );
}
