import { Dialog } from "@ark-ui/react/dialog";
import type { FC } from "react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { ModelPermissions } from "./model-permissions.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";

type ApiKey = {
    id: string;
    name?: string | null;
    start?: string | null;
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
            accountPermissions?: string[] | null;
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
    const [allowedModels, setAllowedModels] = useState<string[] | null>(
        apiKey.permissions?.models ?? null
    );
    const [pollenBudget, setPollenBudget] = useState<number | null>(
        apiKey.pollenBalance ?? null
    );
    const [accountPermissions, setAccountPermissions] = useState<string[] | null>(
        apiKey.permissions?.account ?? null
    );

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            await onUpdate(apiKey.id, {
                allowedModels,
                pollenBudget,
                accountPermissions,
            });
            onClose();
        } catch (error) {
            console.error("Failed to update API key:", error);
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
                    <Dialog.Title className="text-lg font-semibold mb-4">
                        Edit: {apiKey.name || "API Key"}
                    </Dialog.Title>

                    <div className="space-y-4">
                        <ModelPermissions
                            value={allowedModels}
                            onChange={setAllowedModels}
                            compact
                        />
                        <PollenBudgetInput
                            value={pollenBudget}
                            onChange={setPollenBudget}
                        />
                        <AccountPermissionsInput
                            value={accountPermissions}
                            onChange={setAccountPermissions}
                        />

                        <div className="flex gap-2 justify-between pt-4 border-t border-gray-300">
                            <Button
                                type="button"
                                color="red"
                                weight="outline"
                                onClick={() => onDelete(apiKey.id).then(onClose)}
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
                                    {isSubmitting ? "Saving..." : "Save"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
