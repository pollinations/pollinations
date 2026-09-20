import { ConfirmationDialog, EyeIcon, EyeOffIcon } from "@pollinations/ui";
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
    const isPrivate = endpoint?.visibility === "private";
    const action = hidden ? (isPrivate ? "Show" : "Relist") : "Hide";
    const kind = endpoint?.type === "proxy" ? "model" : "agent";
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
                        ? isPrivate
                            ? "It stays private now and can appear in listings if you publish it later."
                            : "It can return to public listings three hours after it was hidden."
                        : isPrivate
                          ? "It stays private and callable by its exact model ID, and remains out of listings if you publish it later."
                          : "It will be removed from model listings but remain callable by its exact model ID."}
                </>
            }
            confirmLabel={action}
            intent="neutral"
            confirmIcon={hidden ? <EyeIcon /> : <EyeOffIcon />}
            onConfirm={onConfirm}
            onCancel={onCancel}
        />
    );
}
