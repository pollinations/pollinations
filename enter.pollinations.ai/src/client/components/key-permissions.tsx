import type { FC } from "react";
import { useState } from "react";
import { ModelPermissions } from "./model-permissions.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";

export type KeyPermissions = {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
};

export type UseKeyPermissionsOptions = {
    defaultExpiryDays?: number | null;
};

/**
 * Hook to manage API key permission state.
 * Used by both dashboard key creation and authorize flow.
 */
export function useKeyPermissions(options: UseKeyPermissionsOptions = {}) {
    const { defaultExpiryDays = null } = options;

    const [allowedModels, setAllowedModels] = useState<string[] | null>(null);
    const [pollenBudget, setPollenBudget] = useState<number | null>(null);
    const [expiryDays, setExpiryDays] = useState<number | null>(
        defaultExpiryDays,
    );
    const [accountPermissions, setAccountPermissions] = useState<
        string[] | null
    >(null);

    return {
        permissions: {
            allowedModels,
            pollenBudget,
            expiryDays,
            accountPermissions,
        },
        setAllowedModels,
        setPollenBudget,
        setExpiryDays,
        setAccountPermissions,
    };
}

/**
 * Update API key permissions via the backend.
 * Shared between dashboard and authorize flows.
 */
export async function updateKeyPermissions(
    keyId: string,
    permissions: Partial<KeyPermissions>,
): Promise<void> {
    const { allowedModels, pollenBudget, accountPermissions } = permissions;

    const hasAllowedModels =
        allowedModels !== null && allowedModels !== undefined;
    const hasPollenBudget = pollenBudget !== null && pollenBudget !== undefined;
    const hasAccountPermissions =
        accountPermissions !== null &&
        accountPermissions !== undefined &&
        accountPermissions.length > 0;

    if (!hasAllowedModels && !hasPollenBudget && !hasAccountPermissions) {
        return; // Nothing to update
    }

    const response = await fetch(`/api/api-keys/${keyId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            ...(hasAllowedModels && { allowedModels }),
            ...(hasPollenBudget && { pollenBudget }),
            ...(hasAccountPermissions && { accountPermissions }),
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
            `Failed to set permissions/budget: ${(errorData as { message?: string }).message || "Unknown error"}`,
        );
    }
}

type KeyPermissionsInputsProps = {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
    onAllowedModelsChange: (value: string[] | null) => void;
    onPollenBudgetChange: (value: number | null) => void;
    onExpiryDaysChange: (value: number | null) => void;
    onAccountPermissionsChange: (value: string[] | null) => void;
    disabled?: boolean;
    compact?: boolean;
};

/**
 * Renders all key permission inputs.
 * Used by both dashboard key creation and authorize flow.
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    allowedModels,
    pollenBudget,
    expiryDays,
    accountPermissions,
    onAllowedModelsChange,
    onPollenBudgetChange,
    onExpiryDaysChange,
    onAccountPermissionsChange,
    disabled = false,
    compact = false,
}) => {
    return (
        <div className="space-y-4">
            <ModelPermissions
                value={allowedModels}
                onChange={onAllowedModelsChange}
                compact={compact}
            />
            <PollenBudgetInput
                value={pollenBudget}
                onChange={onPollenBudgetChange}
                disabled={disabled}
            />
            <ExpiryDaysInput
                value={expiryDays}
                onChange={onExpiryDaysChange}
                disabled={disabled}
            />
            <AccountPermissionsInput
                value={accountPermissions}
                onChange={onAccountPermissionsChange}
                disabled={disabled}
            />
        </div>
    );
};
