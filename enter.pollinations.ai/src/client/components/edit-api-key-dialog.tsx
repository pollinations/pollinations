import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";

interface ApiKey {
    id: string;
    name?: string | null;
    start?: string | null;
    enabled?: boolean;
    pollenBalance?: number | null;
    permissions: Record<string, string[]> | null;
    metadata?: Record<string, unknown> | null;
    expiresAt?: string | null;
}

interface EditApiKeyDialogProps {
    apiKey: ApiKey;
    onUpdate: (
        id: string,
        updates: {
            name?: string;
            allowedModels?: string[] | null;
            pollenBudget?: number | null;
            accountPermissions?: string[] | null;
            expiresAt?: Date | null;
        },
    ) => Promise<void>;
    onClose: () => void;
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

    const handleCopyKey = async () => {
        if (!plaintextKey) return;
        try {
            await navigator.clipboard.writeText(plaintextKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (_err) {
            // Silently fail
        }
    };

    const keyPermissions = useKeyPermissions({
        allowedModels: apiKey.permissions?.models ?? null,
        pollenBudget: apiKey.pollenBalance ?? null,
        accountPermissions: apiKey.permissions?.account ?? null,
        expiryDays: apiKey.expiresAt
            ? Math.ceil(
                  (new Date(apiKey.expiresAt).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24),
              )
            : null,
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
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                <Dialog.Content
                    className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto"
                    style={{
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(156, 163, 175, 0.5) transparent",
                    }}
                >
                    <Dialog.Title className="text-xl font-bold mb-6">
                        Edit API Key
                    </Dialog.Title>

                    <div className="flex items-center gap-3 mb-6">
                        <span
                            className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                                isPublishable
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-purple-100 text-purple-700"
                            }`}
                        >
                            {isPublishable ? "🌐 Publishable" : "🔒 Secret"}
                        </span>
                        {isPublishable && plaintextKey ? (
                            <button
                                type="button"
                                onClick={handleCopyKey}
                                className={`font-mono text-sm cursor-pointer transition-all ${
                                    copied
                                        ? "text-green-600 font-semibold"
                                        : "text-blue-600 hover:text-blue-800 hover:underline"
                                }`}
                                title={copied ? "Copied!" : "Click to copy"}
                            >
                                {copied ? "✓ Copied!" : plaintextKey}
                            </button>
                        ) : (
                            <span className="font-mono text-sm text-gray-600">
                                {apiKey.start}...
                            </span>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                            {error}
                        </div>
                    )}

                    <div className="space-y-6">
                        <Field.Root>
                            <Field.Label className="block text-sm font-semibold mb-2">
                                Name
                            </Field.Label>
                            <Field.Input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter API key name"
                                disabled={isSubmitting}
                            />
                        </Field.Root>

                        <KeyPermissionsInputs
                            value={keyPermissions}
                            disabled={isSubmitting}
                        />

                        <div className="flex gap-2 justify-end pt-4 border-t border-gray-300">
                            <Button
                                type="button"
                                weight="outline"
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
                    </div>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
