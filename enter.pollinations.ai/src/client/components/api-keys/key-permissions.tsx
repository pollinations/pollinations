import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import { PollenBudgetInput } from "./pollen-budget-input.tsx";

export interface KeyPermissions {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
    tierOnly: boolean;
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
    const [expiryDays, setExpiryDays] = useState(initial.expiryDays ?? null);
    const [accountPermissions, setAccountPermissions] = useState(
        initial.accountPermissions ?? DEFAULT_ACCOUNT_PERMISSIONS,
    );
    const [tierOnly, setTierOnly] = useState(initial.tierOnly ?? false);

    return {
        permissions: {
            allowedModels,
            pollenBudget,
            expiryDays,
            accountPermissions,
            tierOnly,
        },
        setAllowedModels,
        setPollenBudget,
        setExpiryDays,
        setAccountPermissions,
        setTierOnly,
    };
}

interface KeyPermissionsInputsProps {
    value: ReturnType<typeof useKeyPermissions>;
    disabled?: boolean;
    inline?: boolean;
}

/**
 * Renders all key permission inputs
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    value,
    disabled = false,
    inline = false,
}) => {
    const {
        permissions,
        setAllowedModels,
        setPollenBudget,
        setExpiryDays,
        setAccountPermissions,
        setTierOnly,
    } = value;

    return (
        <div className="space-y-6">
            <PollenBudgetInput
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                disabled={disabled}
                inline={inline}
            />
            <ExpiryDaysInput
                value={permissions.expiryDays}
                onChange={setExpiryDays}
                disabled={disabled}
                inline={inline}
            />
            {/* Tier-only toggle */}
            <div>
                <div className="text-sm font-semibold mb-2">Balance Mode</div>
                <button
                    type="button"
                    onClick={() => setTierOnly(!permissions.tierOnly)}
                    disabled={disabled}
                    className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left cursor-pointer",
                        permissions.tierOnly
                            ? "border-amber-400 bg-amber-50"
                            : "border-gray-200 hover:border-gray-300",
                        disabled && "opacity-50 cursor-not-allowed",
                    )}
                >
                    <div className="flex-1">
                        <span className="text-sm font-medium">Tier Only</span>
                        <span className="text-sm text-gray-500">
                            {" "}
                            – {permissions.tierOnly
                                ? "Uses daily tier balance only (ignores paid)"
                                : "Uses all available balances"}
                        </span>
                    </div>
                    <span className="text-gray-400 text-lg leading-none">
                        {permissions.tierOnly ? "✕" : "+"}
                    </span>
                </button>
            </div>
            <AccountPermissionsInput
                value={permissions.accountPermissions}
                onChange={setAccountPermissions}
                disabled={disabled}
                allowedModels={permissions.allowedModels}
                onModelsChange={setAllowedModels}
            />
        </div>
    );
};
