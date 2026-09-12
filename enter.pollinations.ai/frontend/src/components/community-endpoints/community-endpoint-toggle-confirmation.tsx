import { ConfirmationDialog } from "@pollinations/ui";
import type { CommunityEndpoint } from "./types.ts";

type CommunityEndpointToggleConfirmationProps = {
    endpoint: CommunityEndpoint | null;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
};

export function CommunityEndpointToggleConfirmation({
    endpoint,
    onConfirm,
    onCancel,
}: CommunityEndpointToggleConfirmationProps) {
    return (
        <ConfirmationDialog
            open={!!endpoint}
            title={`${endpoint?.hidden ? "Relist" : "Hide"} ${endpoint?.type === "proxy" ? "Model" : "Agent"}`}
            confirmLabel={endpoint?.hidden ? "Relist" : "Hide"}
            pendingLabel={endpoint?.hidden ? "Relisting…" : "Hiding…"}
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <p>
                {endpoint?.hidden ? "Relist" : "Hide"}{" "}
                <span className="font-mono text-sm">{endpoint?.modelId}</span>?{" "}
                {endpoint?.hidden
                    ? "It will appear in model listings again."
                    : "It will be removed from model listings but remain callable by its exact model ID."}
            </p>
        </ConfirmationDialog>
    );
}
