import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { Card } from "../ui/card.tsx";
import { Input } from "../ui/input.tsx";
import { Tag } from "../ui/tag.tsx";
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

export const EditApiKeyDialog: FC<EditApiKeyDialogProps> = ({
    apiKey,
    onUpdate,
    onClose,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [name, setName] = useState(apiKey.name || "");
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isPublishable = apiKey.metadata?.keyType === "publishable";
    const plaintextKey = apiKey.metadata?.plaintextKey as string | undefined;

    const initialRedirectUris = readInitialRedirectUris(apiKey.metadata);
    const isAppKey = isPublishable && initialRedirectUris.length > 0;
    const [redirectUris, setRedirectUris] =
        useState<string[]>(initialRedirectUris);

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

            // Save app settings for publishable keys
            if (
                isPublishable &&
                !sameRedirectUris(redirectUris, initialRedirectUris)
            ) {
                const cleaned = redirectUris
                    .map((v) => v.trim())
                    .filter((v) => v !== "");
                const metaRes = await fetch(
                    `/api/api-keys/${apiKey.id}/metadata`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ redirectUris: cleaned }),
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
                        "my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border-4 shadow-lg",
                        "border-blue-300 bg-white",
                    )}
                >
                    <div className="shrink-0 p-6 pb-4">
                        <Dialog.Title className="text-xl font-bold mb-4">
                            {isAppKey ? "Edit App Key" : "Edit API Key"}
                        </Dialog.Title>

                        <div className="flex items-center gap-3">
                            <Tag color="blue">
                                {isAppKey
                                    ? "🖥️ App"
                                    : isPublishable
                                      ? "🌐 Publishable"
                                      : "🔒 Secret"}
                            </Tag>
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
                            <Card
                                color="red"
                                bg="bg-red-100"
                                className="mb-4 text-red-700"
                            >
                                {error}
                            </Card>
                        )}

                        <div className="space-y-4">
                            <Field.Root className="flex items-center gap-3">
                                <Field.Label className="text-sm font-semibold shrink-0">
                                    Name
                                </Field.Label>
                                <Input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="flex-1 border-blue-200 bg-blue-50 focus-visible:border-blue-300 focus-visible:ring-blue-200"
                                    placeholder="Enter API key name"
                                    disabled={isSubmitting}
                                />
                            </Field.Root>

                            {isPublishable && (
                                <PublishableKeySettings
                                    redirectUris={redirectUris}
                                    onRedirectUrisChange={setRedirectUris}
                                    disabled={isSubmitting}
                                />
                            )}

                            {!isAppKey && (
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
                            color="red"
                            weight="light"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            color="blue"
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
