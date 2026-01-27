import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";

type ApiKey = {
    id: string;
    name?: string | null;
    start?: string | null;
    pollenBalance?: number | null;
    permissions: { [key: string]: string[] } | null;
    expiresAt?: Date | null;
};

type EditApiKeyDialogProps = {
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
};

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
            ? Math.ceil((new Date(apiKey.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null,
    });

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            await onUpdate(apiKey.id, {
                name,
                allowedModels: keyPermissions.permissions.allowedModels,
                pollenBudget: keyPermissions.permissions.pollenBudget,
                accountPermissions: keyPermissions.permissions.accountPermissions,
                expiresAt: keyPermissions.permissions.expiryDays
                    ? new Date(Date.now() + keyPermissions.permissions.expiryDays * 24 * 60 * 60 * 1000)
                    : null,
            });
            onClose();
        } catch (error) {
            console.error("Failed to update API key:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        setIsSubmitting(true);
        try {
            await onDelete(apiKey.id);
            onClose();
        } catch (error) {
            console.error("Failed to delete API key:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

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

                        <Field.Root>
                            <Field.Label className="block text-sm font-semibold mb-2">
                                Key (Read-only)
                            </Field.Label>
                            <div className="px-3 py-2 bg-gray-100 rounded border border-gray-300 font-mono text-xs text-gray-600">
                                {apiKey.start}...
                            </div>
                        </Field.Root>

                        <KeyPermissionsInputs
                            value={keyPermissions}
                            disabled={isSubmitting}
                        />

                        <div className="flex gap-2 justify-between pt-4 border-t border-gray-300">
                            {!showDeleteConfirm ? (
                                <>
                                    <Button
                                        type="button"
                                        color="red"
                                        weight="outline"
                                        onClick={() => setShowDeleteConfirm(true)}
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
                                            {isSubmitting ? "Saving..." : "Save Changes"}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-sm text-red-600 font-medium">
                                        Delete this key permanently?
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            weight="outline"
                                            onClick={() => setShowDeleteConfirm(false)}
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
                                            {isSubmitting ? "Deleting..." : "Confirm Delete"}
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
