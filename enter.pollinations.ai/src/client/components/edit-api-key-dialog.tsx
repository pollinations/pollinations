import { Dialog } from "@ark-ui/react/dialog";
import { Switch } from "@ark-ui/react/switch";
import type { FC } from "react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";

type ApiKey = {
    id: string;
    name?: string | null;
    start?: string | null;
    enabled?: boolean;
    pollenBalance?: number | null;
    permissions: { [key: string]: string[] } | null;
};

type EditApiKeyDialogProps = {
    apiKey: ApiKey;
    onUpdate: (
        id: string,
        updates: {
            allowedModels?: string[] | null;
            pollenBudget?: number | null;
            enabled?: boolean;
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
    const [enabled, setEnabled] = useState(apiKey.enabled ?? true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const keyPermissions = useKeyPermissions({
        allowedModels: apiKey.permissions?.models ?? null,
        pollenBudget: apiKey.pollenBalance ?? null,
    });

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            await onUpdate(apiKey.id, {
                allowedModels: keyPermissions.permissions.allowedModels,
                pollenBudget: keyPermissions.permissions.pollenBudget,
                enabled,
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
                    className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
                    style={{
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(156, 163, 175, 0.5) transparent",
                    }}
                >
                    <Dialog.Title className="text-lg font-semibold mb-6">
                        Manage API Key
                    </Dialog.Title>

                    <div className="space-y-6">
                        {/* Key Info (Read-only) */}
                        <div className="space-y-2">
                            <div className="text-sm font-semibold">Name</div>
                            <div className="px-3 py-2 bg-gray-100 rounded border border-gray-300 text-sm">
                                {apiKey.name || "Unnamed"}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-semibold">Key</div>
                            <div className="px-3 py-2 bg-gray-100 rounded border border-gray-300 font-mono text-xs text-gray-500">
                                {apiKey.start}...
                            </div>
                        </div>

                        {/* Enabled Toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold">
                                    Enabled
                                </div>
                                <div className="text-xs text-gray-500">
                                    Disabled keys cannot make API calls
                                </div>
                            </div>
                            <Switch.Root
                                checked={enabled}
                                onCheckedChange={({ checked }) =>
                                    setEnabled(checked)
                                }
                                className="flex items-center"
                            >
                                <Switch.Control
                                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? "bg-green-500" : "bg-gray-300"}`}
                                >
                                    <Switch.Thumb
                                        className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
                                    />
                                </Switch.Control>
                            </Switch.Root>
                        </div>

                        {/* Permissions */}
                        <KeyPermissionsInputs
                            value={keyPermissions}
                            disabled={isSubmitting}
                            compact
                        />

                        {/* Actions */}
                        <div className="flex gap-2 justify-between pt-4 border-t border-gray-300">
                            {!showDeleteConfirm ? (
                                <>
                                    <Button
                                        type="button"
                                        color="red"
                                        weight="outline"
                                        onClick={() =>
                                            setShowDeleteConfirm(true)
                                        }
                                        className="disabled:opacity-50"
                                        disabled={isSubmitting}
                                    >
                                        Delete
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
                                                : "Save"}
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
                            )}
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
