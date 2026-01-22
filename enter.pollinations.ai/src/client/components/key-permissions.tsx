import type { FC } from "react";
import { useState } from "react";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import { ModelPermissions } from "./model-permissions.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";

export type KeyPermissions = {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
};

export type UseKeyPermissionsOptions = Partial<KeyPermissions>;

/**
 * Hook to manage API key permission state.
 * Used by both dashboard key creation and authorize flow.
 * All fields can be pre-populated via options (e.g., from URL params).
 */
export function useKeyPermissions(options: UseKeyPermissionsOptions = {}) {
    const [allowedModels, setAllowedModels] = useState<string[] | null>(
        options.allowedModels ?? null,
    );
    const [pollenBudget, setPollenBudget] = useState<number | null>(
        options.pollenBudget ?? null,
    );
    const [expiryDays, setExpiryDays] = useState<number | null>(
        options.expiryDays ?? null,
    );
    const [accountPermissions, setAccountPermissions] = useState<
        string[] | null
    >(options.accountPermissions ?? null);

    const updatePermissions = async (keyId: string) => {
        await updateKeyPermissions(keyId, {
            allowedModels,
            pollenBudget,
            accountPermissions,
        });
    };

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
        updatePermissions,
    };
}

/**
 * Update API key permissions via the backend.
 * Internal utility - prefer using the hook's updatePermissions method.
 */
async function updateKeyPermissions(
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
    value: {
        permissions: KeyPermissions;
        setAllowedModels: (models: string[] | null) => void;
        setPollenBudget: (val: number | null) => void;
        setExpiryDays: (val: number | null) => void;
        setAccountPermissions: (val: string[] | null) => void;
        updatePermissions?: (keyId: string) => Promise<void>;
    };
    disabled?: boolean;
    compact?: boolean;
};

/**
 * Renders all key permission inputs.
 * Used by both dashboard key creation and authorize flow.
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
