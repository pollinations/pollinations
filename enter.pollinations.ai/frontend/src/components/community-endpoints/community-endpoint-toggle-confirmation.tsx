import { ConfirmationDialog, EyeIcon, EyeOffIcon } from "@pollinations/ui";
import { ResourceConfirmationContent } from "./resource-confirmation-content.tsx";
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
    const action = hidden ? "Relist" : "Unlist";
    const kind = endpoint?.type === "proxy" ? "model" : "agent";
    return (
        <ConfirmationDialog
            open={!!endpoint}
            title={`${action} ${kind}?`}
            confirmLabel={action}
            intent="commit"
            confirmIcon={hidden ? <EyeIcon /> : <EyeOffIcon />}
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <ResourceConfirmationContent resource={endpoint?.modelId}>
                {hidden
                    ? isPrivate
                        ? `This ${kind} stays private and can appear in listings if you publish it later.`
                        : `This ${kind} will return to public listings.`
                    : isPrivate
                      ? `This ${kind} stays private and remains unlisted if you publish it later.`
                      : `This ${kind} will be removed from public listings but remain callable by its exact model ID.`}
            </ResourceConfirmationContent>
        </ConfirmationDialog>
    );
}
