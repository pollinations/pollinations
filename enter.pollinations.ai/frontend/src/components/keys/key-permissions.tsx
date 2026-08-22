import type { FC } from "react";
import { useState } from "react";
import { useModelCategories } from "../models/use-model-categories.ts";
import { useOwnCommunityModels } from "../models/use-own-community-models.ts";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";
import { PollenTypeInput } from "./pollen-type-input.tsx";

export interface KeyPermissions {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    pollenType: "quest" | "paid" | null;
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
    const [pollenType, setPollenType] = useState<"quest" | "paid" | null>(
        initial.pollenType ?? null,
    );
    const [expiryDays, setExpiryDays] = useState(initial.expiryDays ?? null);
    const [accountPermissions, setAccountPermissions] = useState<
        string[] | null
    >(initial.accountPermissions ?? []);

    return {
        permissions: {
            allowedModels,
            pollenBudget,
            pollenType,
            expiryDays,
            accountPermissions,
        },
        setAllowedModels,
        setPollenBudget,
        setPollenType,
        setExpiryDays,
        setAccountPermissions,
    };
}

interface KeyPermissionsInputsProps {
    value: ReturnType<typeof useKeyPermissions>;
    disabled?: boolean;
    inline?: boolean;
    modelsInitiallyExpanded?: boolean;
}

/**
 * Renders all key permission inputs
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    value,
    disabled = false,
    inline = false,
    modelsInitiallyExpanded = false,
}) => {
    const {
        permissions,
        setAllowedModels,
        setPollenBudget,
        setPollenType,
        setExpiryDays,
        setAccountPermissions,
    } = value;
    // A dashboard key belongs to the account, so it can call that account's own
    // private models. Offer them here too, or a key already scoped to one shows
    // up as granting nothing and loses the grant on the next edit.
    const modelCategories = useModelCategories(useOwnCommunityModels());

    return (
        <div className="space-y-6">
            <hr className="border-divider" />
            <PollenBudgetInput
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                disabled={disabled}
                inline={inline}
            />
            <PollenTypeInput
                value={permissions.pollenType}
                onChange={setPollenType}
                disabled={disabled}
                inline={inline}
            />
            <ExpiryDaysInput
                value={permissions.expiryDays}
                onChange={setExpiryDays}
                disabled={disabled}
                inline={inline}
            />
            <hr className="border-divider" />
            <AccountPermissionsInput
                value={permissions.accountPermissions}
                onChange={setAccountPermissions}
                disabled={disabled}
                allowedModels={permissions.allowedModels}
                onModelsChange={setAllowedModels}
                modelsInitiallyExpanded={modelsInitiallyExpanded}
                modelCategories={modelCategories}
            />
        </div>
    );
};
