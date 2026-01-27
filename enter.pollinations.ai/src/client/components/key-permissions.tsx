import type { FC } from "react";
import { useState } from "react";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import { ModelPermissions } from "./model-permissions.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";

export interface KeyPermissions {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
}

/**
 * Hook to manage API key permission state
 */
export function useKeyPermissions(initial: Partial<KeyPermissions> = {}) {
    const [allowedModels, setAllowedModels] = useState(
        initial.allowedModels ?? null,
    );
    const [pollenBudget, setPollenBudget] = useState(
        initial.pollenBudget ?? null,
    );
    const [expiryDays, setExpiryDays] = useState(initial.expiryDays ?? null);
    const [accountPermissions, setAccountPermissions] = useState(
        initial.accountPermissions ?? null,
    );

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
        updatePermissions: (keyId: string) =>
            updateKeyPermissions(keyId, {
                allowedModels,
                pollenBudget,
                accountPermissions,
            }),
    };
}

/**
 * Update API key permissions via the backend
 */
async function updateKeyPermissions(
    keyId: string,
    permissions: Partial<KeyPermissions>,
): Promise<void> {
    const { allowedModels, pollenBudget, accountPermissions } = permissions;

    const updates = {
        ...(allowedModels !== undefined && { allowedModels }),
        ...(pollenBudget !== undefined && { pollenBudget }),
        ...(accountPermissions?.length && { accountPermissions }),
    };

    if (!Object.keys(updates).length) return;

    const response = await fetch(`/api/api-keys/${keyId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(
            `Failed to update permissions: ${(error as { message?: string }).message || "Unknown error"}`,
        );
    }
}

interface KeyPermissionsInputsProps {
    value: ReturnType<typeof useKeyPermissions>;
    disabled?: boolean;
    compact?: boolean;
}

/**
 * Renders all key permission inputs
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    value,
    disabled = false,
    compact = false,
}) => {
    const {
        permissions,
        setAllowedModels,
        setPollenBudget,
        setExpiryDays,
        setAccountPermissions,
    } = value;

    return (
        <div className="space-y-6">
            <ModelPermissions
                value={permissions.allowedModels}
                onChange={setAllowedModels}
                compact={compact}
            />
            <PollenBudgetInput
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                disabled={disabled}
            />
            <ExpiryDaysInput
                value={permissions.expiryDays}
                onChange={setExpiryDays}
                disabled={disabled}
            />
            <AccountPermissionsInput
                value={permissions.accountPermissions}
                onChange={setAccountPermissions}
                disabled={disabled}
            />
        </div>
    );
};
