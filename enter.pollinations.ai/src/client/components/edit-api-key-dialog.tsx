import type { FC } from "react";
import { ApiKeyDialog } from "./api-key-dialog.tsx";

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
    const handleSave = async (data: {
        name?: string;
        allowedModels?: string[] | null;
        pollenBudget?: number | null;
        accountPermissions?: string[] | null;
        expiryDays?: number | null;
    }) => {
        const { expiryDays, ...updates } = data;
        await onUpdate(apiKey.id, {
            ...updates,
            expiresAt: expiryDays
                ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
                : null,
        });
    };

    return (
        <ApiKeyDialog
            mode="edit"
            apiKey={apiKey}
            onSave={handleSave}
            onDelete={onDelete}
            onClose={onClose}
        />
    );
};
