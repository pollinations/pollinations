import { apiClient } from "@frontend/api.ts";
import {
    AppIcon,
    Button,
    Chip,
    CopyButton,
    cn,
    Dialog,
    DialogTitle,
    Field,
    GlobeIcon,
    Input,
    LockIcon,
    ScrollArea,
} from "@pollinations/ui";
import type { FC } from "react";
import { useState } from "react";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import { PublishableKeySettings } from "./publishable-key-settings.tsx";
import type { ApiKey, ApiKeyUpdateParams } from "./types.ts";

interface EditApiKeyDialogProps {
    apiKey: ApiKey;
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onClose: () => void;
}

function readInitialRedirectUris(
    metadata: Record<string, unknown> | null | undefined,
): string[] {
    const list = metadata?.redirectUris;
    if (Array.isArray(list)) {
        return list.filter((v): v is string => typeof v === "string" && !!v);
    }
    return [];
}

function sameRedirectUris(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

function cleanRedirectUris(uris: string[]): string[] {
    return uris.map((v) => v.trim()).filter((v) => v !== "");
}

function isPublishableKey(apiKey: ApiKey): boolean {
    return apiKey.metadata?.keyType === "publishable";
}

function isAppKey(apiKey: ApiKey): boolean {
    return (
        isPublishableKey(apiKey) &&
        (readInitialRedirectUris(apiKey.metadata).length > 0 ||
            apiKey.metadata?.earningsEnabled === true)
    );
}

export const EditApiKeyDialog: FC<EditApiKeyDialogProps> = ({
    apiKey,
    onUpdate,
    onClose,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [name, setName] = useState(apiKey.name || "");
    const [error, setError] = useState<string | null>(null);

    const isPublishable = isPublishableKey(apiKey);
    const appKey = isAppKey(apiKey);
    const plaintextKey = apiKey.metadata?.plaintextKey as string | undefined;

    const initialRedirectUris = readInitialRedirectUris(apiKey.metadata);
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
            const { expiryDays, ...permissions } = keyPermissions.permissions;
            await onUpdate(apiKey.id, {
                name,
                ...permissions,
                expiresAt: expiryDays
                    ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
                    : null,
            });

            // Save app settings only for keys that belong in the App section.
            if (appKey) {
                const cleaned = cleanRedirectUris(redirectUris);
                if (
                    sameRedirectUris(cleaned, initialRedirectUris) &&
                    earningsEnabled === initialEarningsEnabled
                ) {
                    onClose();
                    return;
                }
                const metadataBody = {
                    redirectUris: cleaned,
                    earningsEnabled,
                };
                const metaRes = await apiClient["api-keys"][
                    ":id"
                ].metadata.$post({
                    param: { id: apiKey.id },
                    json: metadataBody,
                });
                if (!metaRes.ok) {
                    const err = await metaRes.json().catch(() => null);
                    throw new Error(
                        (err as { error?: { message?: string } })?.error
                            ?.message || "Failed to save key metadata",
                    );
                }
            }

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
        <Dialog
            open
            onOpenChange={(open) => !open && onClose()}
            contentClassName="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
            <div className="shrink-0 p-6 pb-4">
                <DialogTitle className="text-xl font-bold mb-4">
                    {appKey ? "Edit App Key" : "Edit API Key"}
                </DialogTitle>

                <div className="flex items-center gap-3">
                    <Chip>
                        {appKey ? (
                            <>
                                <AppIcon className="h-4 w-4" />
                                App
                            </>
                        ) : isPublishable ? (
                            <>
                                <GlobeIcon className="h-4 w-4" />
                                Publishable
                            </>
                        ) : (
                            <>
                                <LockIcon className="h-4 w-4" />
                                Secret
                            </>
                        )}
                    </Chip>
                    {isPublishable && plaintextKey ? (
                        <CopyButton
                            value={plaintextKey}
                            tooltipClassName="inline-flex min-w-0"
                            aria-label="Copy publishable API key"
                            className={(copied) =>
                                cn(
                                    "font-mono text-sm cursor-pointer transition-all",
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
            </div>

            <ScrollArea className="min-h-0 flex-1 overscroll-contain p-6 py-4 touch-pan-y [-webkit-overflow-scrolling:touch]">
                {error && (
                    <div className="mb-4 rounded-xl bg-intent-danger-bg-light p-4 text-intent-danger-text">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <Field.Root className="flex flex-col gap-2">
                        <Field.Label className="text-sm font-semibold">
                            Name
                        </Field.Label>
                        <Input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full"
                            placeholder="Enter API key name"
                            disabled={isSubmitting}
                        />
                    </Field.Root>

                    {appKey && (
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
                            inline
                        />
                    )}
                </div>
            </ScrollArea>

            <div className="flex gap-2 justify-end p-6 pt-4 shrink-0">
                <Button
                    type="button"
                    intent="danger"
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={handleSave}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Saving..." : "Save"}
                </Button>
            </div>
        </Dialog>
    );
};
