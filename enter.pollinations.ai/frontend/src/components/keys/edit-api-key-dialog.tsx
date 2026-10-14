import { AuthModal } from "@pollinations/ui/auth";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { resourceActionError } from "../../lib/resource-action-error.ts";
import { ResourceDialog } from "../layout/resource-dialog.tsx";
import { KeyDialogContent } from "./key-dialog-content.tsx";
import { initialKeyEditValues, keyEditUpdates } from "./key-edit-values.ts";
import { useKeyPermissions } from "./key-permissions.tsx";
import { isAppKey, isPublishableKey } from "./key-type.ts";
import type { ApiKey, ApiKeyUpdateParams } from "./types.ts";

interface EditApiKeyDialogProps {
    apiKey: ApiKey;
    /** Use grant-specific wording in the standalone editor. */
    accessContext?: "app" | "device";
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onClose: () => void;
    /** Standalone page shell with its own header; the dashboard uses the dialog overlay. */
    header?: ReactNode;
    /** Standalone page only: the line under the actions. */
    footnote?: ReactNode;
}

function cleanRedirectUris(uris: string[]): string[] {
    return uris.map((v) => v.trim()).filter((v) => v !== "");
}

export const EditApiKeyDialog: FC<EditApiKeyDialogProps> = ({
    apiKey,
    accessContext,
    onUpdate,
    onClose,
    header,
    footnote,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [initialValues] = useState(() => initialKeyEditValues(apiKey));
    const [name, setName] = useState(initialValues.name ?? "");
    const [error, setError] = useState<string | null>(null);

    const isPublishable = isPublishableKey(apiKey);
    const appKey = isAppKey(apiKey);
    const plaintextKey = apiKey.metadata?.plaintextKey as string | undefined;

    const [redirectUris, setRedirectUris] = useState(
        initialValues.redirectUris ?? [],
    );
    const [earningsEnabled, setEarningsEnabled] = useState(
        initialValues.earningsEnabled ?? false,
    );
    const keyPermissions = useKeyPermissions(initialValues);

    async function handleSave() {
        setIsSubmitting(true);
        setError(null);
        try {
            const updates = keyEditUpdates(initialValues, {
                name,
                ...(isPublishable
                    ? {
                          redirectUris: cleanRedirectUris(redirectUris),
                          earningsEnabled,
                      }
                    : keyPermissions.permissions),
            });
            if (Object.keys(updates).length > 0) {
                await onUpdate(apiKey.id, updates);
            }

            onClose();
        } catch (error) {
            console.error("Failed to update API key:", error);
            setError(
                resourceActionError(
                    "save",
                    accessContext
                        ? `${accessContext} access`
                        : appKey
                          ? "the app key"
                          : "the secret key",
                    error,
                ),
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    // Same content in both places: the standalone page paints the page shell,
    // the dashboard dims the page behind a dialog.
    const Shell = header ? AuthModal : DashboardDialog;
    return (
        <Shell onClose={onClose} size="lg">
            <KeyDialogContent
                header={header}
                mode="edit"
                accessContext={accessContext}
                app={appKey}
                publishable={isPublishable}
                name={name}
                onNameChange={setName}
                permissions={keyPermissions}
                redirectUris={redirectUris}
                onRedirectUrisChange={setRedirectUris}
                earningsEnabled={earningsEnabled}
                onEarningsEnabledChange={setEarningsEnabled}
                existingKey={{
                    prefix: apiKey.start ?? "",
                    value: isPublishable ? plaintextKey : undefined,
                }}
                error={error}
                isSubmitting={isSubmitting}
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleSave();
                }}
                onClose={onClose}
                footnote={footnote}
            />
        </Shell>
    );
};

const DashboardDialog: FC<{
    onClose: () => void;
    size: "lg";
    children: ReactNode;
}> = ({ onClose, size, children }) => (
    <ResourceDialog
        open
        onOpenChange={(open) => !open && onClose()}
        size={size}
    >
        {children}
    </ResourceDialog>
);
