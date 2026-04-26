import type { FC } from "react";
import { useState } from "react";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import type { PermissionUiTheme } from "./permission-ui.ts";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";
import { SafetyInput } from "./safety-input.tsx";

export interface KeyPermissions {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
    safe: string;
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
    const [safe, setSafe] = useState(initial.safe ?? "");

    return {
        permissions: {
            allowedModels,
            pollenBudget,
            expiryDays,
            accountPermissions,
            safe,
        },
        setAllowedModels,
        setPollenBudget,
        setExpiryDays,
        setAccountPermissions,
        setSafe,
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
        setSafe,
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
            <div className="text-sm font-semibold">Permissions</div>
            <AccountPermissionsInput
                value={permissions.accountPermissions}
                onChange={setAccountPermissions}
                disabled={disabled}
                allowedModels={permissions.allowedModels}
                onModelsChange={setAllowedModels}
                theme={theme}
                modelsInitiallyExpanded={modelsInitiallyExpanded}
            />
            <SafetyInput
                value={permissions.safe}
                onChange={setSafe}
                disabled={disabled}
                theme={theme}
            />
        </div>
    );
};
