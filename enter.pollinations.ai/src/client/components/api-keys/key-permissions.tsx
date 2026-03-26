import type { FC } from "react";
import { useState } from "react";
import {
    DEFAULT_SPEND_POLICY,
    type SpendPolicy,
} from "@/utils/spend-policy.ts";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";

export interface KeyPermissions {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    spendPolicy: SpendPolicy;
    expiryDays: number | null;
    accountPermissions: string[] | null;
}

/**
 * Hook to manage API key permission state
 */
const DEFAULT_ACCOUNT_PERMISSIONS = ["profile", "balance"];

export function useKeyPermissions(initial: Partial<KeyPermissions> = {}) {
    const [allowedModels, setAllowedModels] = useState(
        initial.allowedModels ?? null,
    );
    const [pollenBudget, setPollenBudget] = useState(
        initial.pollenBudget ?? null,
    );
    const [spendPolicy, setSpendPolicy] = useState(
        initial.spendPolicy ?? DEFAULT_SPEND_POLICY,
    );
    const [expiryDays, setExpiryDays] = useState(initial.expiryDays ?? null);
    const [accountPermissions, setAccountPermissions] = useState(
        initial.accountPermissions !== undefined
            ? initial.accountPermissions
            : DEFAULT_ACCOUNT_PERMISSIONS,
    );

    return {
        permissions: {
            allowedModels,
            pollenBudget,
            spendPolicy,
            expiryDays,
            accountPermissions,
        },
        setAllowedModels,
        setPollenBudget,
        setSpendPolicy,
        setExpiryDays,
        setAccountPermissions,
    };
}

interface KeyPermissionsInputsProps {
    value: ReturnType<typeof useKeyPermissions>;
    disabled?: boolean;
    inline?: boolean;
    showSpendPolicy?: boolean;
}

/**
 * Renders all key permission inputs
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    value,
    disabled = false,
    inline = false,
    showSpendPolicy = true,
}) => {
    const {
        permissions,
        setAllowedModels,
        setPollenBudget,
        setSpendPolicy,
        setExpiryDays,
        setAccountPermissions,
    } = value;

    return (
        <div className="space-y-6">
            <PollenBudgetInput
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                spendPolicy={permissions.spendPolicy}
                onSpendPolicyChange={setSpendPolicy}
                showSpendPolicy={showSpendPolicy}
                disabled={disabled}
                inline={inline}
            />
            <AccountPermissionsInput
                value={permissions.accountPermissions}
                onChange={setAccountPermissions}
                disabled={disabled}
                allowedModels={permissions.allowedModels}
                onModelsChange={setAllowedModels}
            />
            <ExpiryDaysInput
                value={permissions.expiryDays}
                onChange={setExpiryDays}
                disabled={disabled}
                inline={inline}
            />
        </div>
    );
};
