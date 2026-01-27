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
    pollenBalance?: number | null;
    permissions: Record<string, string[]> | null;
    expiresAt?: Date | null;
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
    onDelete: (id: string) => Promise<void>;
    onClose: () => void;
}

export const EditApiKeyDialog: FC<EditApiKeyDialogProps> = ({
    apiKey,
    onUpdate,
    onDelete,
    onClose,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [name, setName] = useState(apiKey.name || "");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleDelete() {
        setIsSubmitting(true);
        try {
            await onDelete(apiKey.id);
            onClose();
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

                    <div className="space-y-6">
                        <Field.Root>
                            <Field.Label className="block text-sm font-semibold mb-2">
                                Current Key
                            </Field.Label>
                            <div className="p-3 rounded-lg border-2 border-gray-200 bg-gray-50">
                                <div className="font-medium text-gray-800 mb-1">
                                    {apiKey.start?.startsWith("pk_")
                                        ? "🌐 Publishable Key"
                                        : "🔒 Secret Key"}
                                </div>
                                <div className="font-mono text-xs text-gray-600">
                                    {apiKey.start}...
                                </div>
                            </div>
                        </Field.Root>

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

                        <div className="flex gap-2 justify-between pt-4 border-t border-gray-300">
                            {showDeleteConfirm ? (
                                <>
                                    <div className="text-sm text-red-600 font-medium">
                                        Delete this key permanently?
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            weight="outline"
                                            onClick={() =>
                                                setShowDeleteConfirm(false)
                                            }
                                            disabled={isSubmitting}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            color="red"
                                            weight="strong"
                                            onClick={handleDelete}
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting
                                                ? "Deleting..."
                                                : "Confirm Delete"}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Button
                                        type="button"
                                        color="red"
                                        weight="outline"
                                        onClick={() =>
                                            setShowDeleteConfirm(true)
                                        }
                                        disabled={isSubmitting}
                                    >
                                        Delete Key
                                    </Button>
                                    <div className="flex gap-2">
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
                                            {isSubmitting
                                                ? "Saving..."
                                                : "Save Changes"}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
