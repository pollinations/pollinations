import type { FC } from "react";
import { useState } from "react";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import type { PermissionUiTheme } from "./permission-ui.ts";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";

export interface KeyPermissions {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
}

export function useKeyPermissions(initial: Partial<KeyPermissions> = {}) {
    const [allowedModels, setAllowedModels] = useState(
        initial.allowedModels ?? null,
    );
    const [pollenBudget, setPollenBudget] = useState(
        initial.pollenBudget ?? null,
    );
    const [expiryDays, setExpiryDays] = useState(initial.expiryDays ?? null);
    const [accountPermissions, setAccountPermissions] = useState<
        string[] | null
    >(initial.accountPermissions ?? []);

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

interface KeyPermissionsInputsProps {
    value: ReturnType<typeof useKeyPermissions>;
    disabled?: boolean;
    inline?: boolean;
    theme?: PermissionUiTheme;
    modelsInitiallyExpanded?: boolean;
}

/**
 * Renders all key permission inputs
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    value,
    disabled = false,
    inline = false,
    theme = "green",
    modelsInitiallyExpanded = false,
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
            <hr className="border-gray-200" />
            <PollenBudgetInput
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                disabled={disabled}
                inline={inline}
                theme={theme}
            />
            <ExpiryDaysInput
                value={permissions.expiryDays}
                onChange={setExpiryDays}
                disabled={disabled}
                inline={inline}
                theme={theme}
            />
            <hr className="border-gray-200" />
            <AccountPermissionsInput
                value={permissions.accountPermissions}
                onChange={setAccountPermissions}
                disabled={disabled}
                allowedModels={permissions.allowedModels}
                onModelsChange={setAllowedModels}
                theme={theme}
                modelsInitiallyExpanded={modelsInitiallyExpanded}
            />
        </div>
    );
};
