import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { Badge } from "../ui/badge.tsx";
import { Card } from "../ui/card.tsx";
import { Input } from "../ui/input.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import type { ApiKey, ApiKeyUpdateParams } from "./types.ts";

interface EditApiKeyDialogProps {
    apiKey: ApiKey;
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
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

    useEffect(() => {
        const originalBodyOverflow = document.body.style.overflow;
        const originalHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = originalBodyOverflow;
            document.documentElement.style.overflow = originalHtmlOverflow;
        };
    }, []);

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
                <Dialog.Content className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-lg w-full max-h-[85vh] flex flex-col">
                    <div className="shrink-0 p-6 pb-4">
                        <Dialog.Title className="text-xl font-bold mb-4">
                            Edit API Key
                        </Dialog.Title>

                        <div className="flex items-center gap-3">
                            <Badge color={isPublishable ? "blue" : "purple"}>
                                {isPublishable ? "🌐 Publishable" : "🔒 Secret"}
                            </Badge>
                            {isPublishable && plaintextKey ? (
                                <button
                                    type="button"
                                    onClick={handleCopyKey}
                                    className={cn(
                                        "font-mono text-sm cursor-pointer transition-all",
                                        copied
                                            ? "text-green-600 font-semibold"
                                            : "text-blue-600 hover:text-blue-800 hover:underline",
                                    )}
                                    title={copied ? "Copied!" : "Click to copy"}
                                >
                                    {copied ? "✓ Copied!" : plaintextKey}
                                </button>
                            ) : (
                                <span className="font-mono text-sm text-gray-500">
                                    {apiKey.start}...
                                </span>
                            )}
                        </div>
                    </div>

                    <div
                        className="flex-1 overflow-y-auto p-6 py-4 scrollbar-subtle"
                        style={{
                            scrollbarWidth: "thin",
                            overscrollBehavior: "contain",
                        }}
                    >
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
                                    className="flex-1"
                                    placeholder="Enter API key name"
                                    disabled={isSubmitting}
                                />
                            </Field.Root>

                            <KeyPermissionsInputs
                                value={keyPermissions}
                                disabled={isSubmitting}
                                inline
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end p-6 pt-4 shrink-0">
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
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
