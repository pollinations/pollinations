import { apiClient } from "@frontend/api.ts";
import {
    AppIcon,
    Button,
    CopyButton,
    cn,
    DialogBody,
    DialogFooter,
    DialogHeader,
    KeyIcon,
    XIcon,
} from "@pollinations/ui";
import { AuthInfoCard, AuthModal, ErrorBanner } from "@pollinations/ui/auth";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { KeyNameField } from "./key-name-field.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import {
    isAppKey,
    isPublishableKey,
    readRedirectUris,
    shouldPostKeyMetadata,
} from "./key-type.ts";
import { PublishableKeySettings } from "./publishable-key-settings.tsx";
import type { ApiKey, ApiKeyUpdateParams } from "./types.ts";

interface EditApiKeyDialogProps {
    apiKey: ApiKey;
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onClose: () => void;
    header?: ReactNode;
}

function cleanRedirectUris(uris: string[]): string[] {
    return uris.map((v) => v.trim()).filter((v) => v !== "");
}

export const EditApiKeyDialog: FC<EditApiKeyDialogProps> = ({
    apiKey,
    onUpdate,
    onClose,
    header,
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
            // Metadata must post before onUpdate: onUpdate ends in
            // router.invalidate(), which would refetch the key list before this
            // write lands and close the dialog onto a stale card.
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
                error instanceof Error
                    ? error.message
                    : "Failed to update API key",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <AuthModal onClose={onClose}>
            {header}
            <DialogHeader
                title={appKey ? "Edit app key" : "Edit key permissions"}
                description={
                    appKey
                        ? "Update your app’s name, callback URLs and earnings settings."
                        : "Choose what this key can access and how much it can spend."
                }
            >
                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
                    {isPublishable && plaintextKey ? (
                        <CopyButton
                            value={plaintextKey}
                            tooltipClassName="inline-flex min-w-0"
                            aria-label="Copy publishable API key"
                            className={(copied) =>
                                cn(
                                    "break-all text-left font-mono text-sm cursor-pointer transition-all",
                                    copied
                                        ? "text-intent-success-text font-semibold"
                                        : "text-theme-text-soft hover:text-theme-text-strong hover:underline",
                                )
                            }
                        >
                            {(copied) => (copied ? "Copied!" : plaintextKey)}
                        </CopyButton>
                    ) : (
                        <span className="font-mono text-sm text-theme-text-muted">
                            {apiKey.start}...
                        </span>
                    )}
                </div>
            </DialogHeader>

            <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleSave();
                }}
            >
                <DialogBody>
                    {error && <ErrorBanner>{error}</ErrorBanner>}

                    <div className="space-y-4">
                        <AuthInfoCard>
                            <KeyNameField
                                app={appKey}
                                value={name}
                                onChange={setName}
                                disabled={isSubmitting}
                            />
                        </AuthInfoCard>
                        {isPublishable && (
                            <PublishableKeySettings
                                redirectUris={redirectUris}
                                onRedirectUrisChange={setRedirectUris}
                                earningsEnabled={earningsEnabled}
                                onEarningsEnabledChange={setEarningsEnabled}
                                disabled={isSubmitting}
                            />
                        )}

                        {!isPublishable && (
                            <KeyPermissionsInputs
                                value={keyPermissions}
                                disabled={isSubmitting}
                            />
                        )}
                    </div>
                </DialogBody>

                <DialogFooter>
                    <Button
                        icon={<XIcon />}
                        type="button"
                        intent="neutral"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        icon={appKey ? <AppIcon /> : <KeyIcon />}
                        type="submit"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Saving…" : "Save changes"}
                    </Button>
                </DialogFooter>
            </form>
        </AuthModal>
    );
};
