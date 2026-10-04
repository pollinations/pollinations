import { apiClient } from "@frontend/api.ts";
import { AuthModal } from "@pollinations/ui/auth";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { resourceActionError } from "../../lib/resource-action-error.ts";
import { ResourceDialog } from "../layout/resource-dialog.tsx";
import { KeyDialogContent } from "./key-dialog-content.tsx";
import { useKeyPermissions } from "./key-permissions.tsx";
import {
    isAppKey,
    isPublishableKey,
    readRedirectUris,
    shouldPostKeyMetadata,
} from "./key-type.ts";
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
    const [name, setName] = useState(apiKey.name || "");
    const [error, setError] = useState<string | null>(null);

    const isPublishable = isPublishableKey(apiKey);
    const appKey = isAppKey(apiKey);
    const plaintextKey = apiKey.metadata?.plaintextKey as string | undefined;

    const initialRedirectUris = readRedirectUris(apiKey.metadata);
    const initialEarningsEnabled = apiKey.metadata?.earningsEnabled === true;
    const [redirectUris, setRedirectUris] =
        useState<string[]>(initialRedirectUris);
    const [earningsEnabled, setEarningsEnabled] = useState(
        initialEarningsEnabled,
    );

    const expiryDays = apiKey.expiresAt
        ? Math.ceil(
              (new Date(apiKey.expiresAt).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
          )
        : null;

    const keyPermissions = useKeyPermissions({
        allowedModels: apiKey.permissions?.models ?? null,
        pollenBudget: apiKey.pollenBalance ?? null,
        accountPermissions: apiKey.permissions?.account ?? null,
        expiryDays,
    });

    async function handleSave() {
        setIsSubmitting(true);
        setError(null);
        try {
            // Save metadata before onUpdate refreshes and waits for the key list.
            const cleaned = cleanRedirectUris(redirectUris);
            if (
                shouldPostKeyMetadata(apiKey, {
                    redirectUris: cleaned,
                    earningsEnabled,
                })
            ) {
                const metaRes = await apiClient["api-keys"][
                    ":id"
                ].metadata.$post({
                    param: { id: apiKey.id },
                    json: { redirectUris: cleaned, earningsEnabled },
                });
                if (!metaRes.ok) {
                    const err = await metaRes.json().catch(() => null);
                    throw new Error(
                        (err as { error?: { message?: string } })?.error
                            ?.message || "Failed to save key metadata",
                    );
                }
            }

            const { expiryDays, ...permissions } = keyPermissions.permissions;
            await onUpdate(apiKey.id, {
                name,
                ...permissions,
                expiresAt: expiryDays
                    ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
                    : null,
            });

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
