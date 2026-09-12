import { Button } from "@pollinations/ui";
import {
    AuthAccessItem,
    AuthInfoCard,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { FC } from "react";
import { useState } from "react";
import { useModelCategories } from "../models/use-model-categories.ts";
import { useOwnCommunityModels } from "../models/use-own-community-models.ts";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { ExpiryDaysInput } from "./expiry-days-input.tsx";
import { ModelPermissionsInput } from "./model-permissions-input.tsx";
import { normalizeAllowedModelSelection } from "./model-selection.ts";
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
        setExpiryDays,
        setAccountPermissions,
    } = value;
    // A dashboard key belongs to the account, so it can call that account's own
    // private models. Offer them here too, or a key already scoped to one shows
    // up as granting nothing and loses the grant on the next edit.
    const {
        categories: modelCategories,
        catalog,
        status,
        retry,
    } = useModelCategories(useOwnCommunityModels());

    const models = modelCategories.flatMap(({ models }) => models);
    return (
        <div className="space-y-3">
            <AuthInfoCard title={null}>
                <ul className="space-y-3 text-sm text-theme-text-base">
                    <AccountPermissionsInput
                        value={permissions.accountPermissions}
                        onChange={(next) =>
                            setAccountPermissions(next.length ? next : null)
                        }
                        disabled={disabled}
                    />
                </ul>
            </AuthInfoCard>
            <AuthInfoCard title={null}>
                <div className="space-y-3 text-sm text-theme-text-base">
                    <ul>
                        <AuthAccessItem checked ariaLabel="AI generation">
                            AI generation
                        </AuthAccessItem>
                    </ul>
                    <PollenBudgetInput
                        value={permissions.pollenBudget}
                        onChange={setPollenBudget}
                        disabled={disabled}
                        inline={inline}
                    />
                    {status === "loading" ? (
                        <output>Loading models…</output>
                    ) : status === "error" ? (
                        <ErrorBanner>
                            <p>Couldn’t load models.</p>
                            <Button
                                type="button"
                                size="sm"
                                onClick={retry}
                                aria-label="Retry loading models"
                                className="polli:mt-2"
                            >
                                Try again
                            </Button>
                        </ErrorBanner>
                    ) : (
                        <ModelPermissionsInput
                            catalog={catalog}
                            categories={modelCategories}
                            models={models}
                            selected={permissions.allowedModels}
                            onChange={(next) =>
                                setAllowedModels(
                                    normalizeAllowedModelSelection(
                                        next,
                                        models.map(({ id }) => id),
                                    ),
                                )
                            }
                            disabled={disabled}
                            initiallyExpanded={
                                modelsInitiallyExpanded ||
                                permissions.allowedModels !== null
                            }
                        />
                    )}
                </div>
            </AuthInfoCard>
            <AuthInfoCard title={null}>
                <ExpiryDaysInput
                    value={permissions.expiryDays}
                    onChange={setExpiryDays}
                    disabled={disabled}
                    inline={inline}
                />
            </AuthInfoCard>
        </div>
    );
};
