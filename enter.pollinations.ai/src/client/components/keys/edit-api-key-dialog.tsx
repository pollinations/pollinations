import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Button } from "../ui/button.tsx";
import { Chip } from "../ui/chip.tsx";
import { Input } from "../ui/input.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
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
    const [copied, setCopied] = useState(false);

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

    async function handleCopyKey(): Promise<void> {
        if (!plaintextKey) return;
        try {
            await navigator.clipboard.writeText(plaintextKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard API may fail in some contexts
        }
    }

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
                const metaRes = await fetch(
                    `/api/api-keys/${apiKey.id}/metadata`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(metadataBody),
                    },
                );
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
        <Dialog.Root open onOpenChange={({ open }) => !open && onClose()}>
            <Dialog.Backdrop className="fixed inset-0 z-[100] bg-gray-950/50" />
            <Dialog.Positioner className="fixed inset-0 z-[110] flex h-dvh items-start justify-center overflow-hidden p-4">
                <Dialog.Content
                    className={cn(
                        "my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border-2 shadow-lg",
                        "border-blue-300 bg-white",
                    )}
                >
                    <div className="shrink-0 p-6 pb-4">
                        <Dialog.Title className="text-xl font-bold mb-4">
                            {appKey ? "Edit App Key" : "Edit API Key"}
                        </Dialog.Title>

                        <div className="flex items-center gap-3">
                            <Chip>
                                {appKey
                                    ? "🖥️ App"
                                    : isPublishable
                                      ? "🌐 Publishable"
                                      : "🔒 Secret"}
                            </Chip>
                            {isPublishable && plaintextKey ? (
                                <Tooltip
                                    triggerAs="span"
                                    content={
                                        copied ? "Copied!" : "Click to copy"
                                    }
                                    className="inline-flex min-w-0"
                                >
                                    <button
                                        type="button"
                                        onClick={handleCopyKey}
                                        className={cn(
                                            "font-mono text-sm cursor-pointer transition-all",
                                            copied
                                                ? "text-blue-700 font-semibold"
                                                : "text-blue-600 hover:text-blue-800 hover:underline",
                                        )}
                                    >
                                        {copied ? "✓ Copied!" : plaintextKey}
                                    </button>
                                </Tooltip>
                            ) : (
                                <span className="font-mono text-sm text-gray-500">
                                    {apiKey.start}...
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 py-4 touch-pan-y [-webkit-overflow-scrolling:touch]">
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
                                    className="w-full border-blue-200 bg-blue-50 focus-visible:border-blue-300 focus-visible:ring-blue-200"
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
                    </div>

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
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
