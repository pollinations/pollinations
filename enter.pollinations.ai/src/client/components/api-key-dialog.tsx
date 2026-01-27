import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { ModelPermissions } from "./model-permissions.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";

type ApiKeyDialogProps = {
    mode: "create" | "edit";
    apiKey?: {
        id: string;
        name?: string | null;
        start?: string | null;
        pollenBalance?: number | null;
        permissions: { [key: string]: string[] } | null;
        expiresAt?: Date | null;
    };
    onSave: (data: {
        id?: string;
        name?: string;
        allowedModels?: string[] | null;
        pollenBudget?: number | null;
        accountPermissions?: string[] | null;
        expiryDays?: number | null;
    }) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    onClose: () => void;
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    mode,
    apiKey,
    onSave,
    onDelete,
    onClose,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [name, setName] = useState(apiKey?.name || "");
    const [allowedModels, setAllowedModels] = useState<string[] | null>(
        apiKey?.permissions?.models ?? null
    );
    const [pollenBudget, setPollenBudget] = useState<number | null>(
        apiKey?.pollenBalance ?? null
    );
    const [accountPermissions, setAccountPermissions] = useState<string[] | null>(
        apiKey?.permissions?.account ?? null
    );
    const [expiryDays, setExpiryDays] = useState<number | null>(
        apiKey?.expiresAt
            ? Math.ceil((new Date(apiKey.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null
    );

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            await onSave({
                ...(mode === "edit" && { id: apiKey?.id }),
                name,
                allowedModels,
                pollenBudget,
                accountPermissions,
                expiryDays,
            });
            onClose();
        } catch (error) {
            console.error("Failed to save API key:", error);
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
                        {mode === "create" ? "Create API Key" : "Edit API Key"}
                    </Dialog.Title>

                    <div className="space-y-4">
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

                        <ModelPermissions
                            value={allowedModels}
                            onChange={setAllowedModels}
                            compact
                        />

                        <PollenBudgetInput
                            value={pollenBudget}
                            onChange={setPollenBudget}
                            disabled={isSubmitting}
                        />

                        <AccountPermissionsInput
                            value={accountPermissions}
                            onChange={setAccountPermissions}
                        />

                        <ExpiryDaysInput
                            value={expiryDays}
                            onChange={setExpiryDays}
                            disabled={isSubmitting}
                        />

                        <div className="flex gap-2 justify-between pt-4 border-t border-gray-300">
                            {mode === "edit" && onDelete && (
                                <Button
                                    type="button"
                                    color="red"
                                    weight="outline"
                                    onClick={() => onDelete(apiKey!.id).then(onClose)}
                                    disabled={isSubmitting}
                                >
                                    Delete
                                </Button>
                            )}
                            <div className={`flex gap-2 ${mode === "create" ? "ml-auto" : ""}`}>
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
                                        ? mode === "create" ? "Creating..." : "Saving..."
                                        : mode === "create" ? "Create" : "Save"
                                    }
                                </Button>
                            </div>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};