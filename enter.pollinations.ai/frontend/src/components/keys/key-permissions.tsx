import { Chip, Surface } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
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
    visiblePermissions?: ReadonlySet<string>;
    requestedModels?: string[] | null;
    showIdentity?: boolean;
}

/**
 * Renders all key permission inputs
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    value,
    disabled = false,
    inline = false,
    visiblePermissions,
    requestedModels,
    showIdentity = false,
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
    const { categories, catalog } = useModelCategories(useOwnCommunityModels());
    const allModels = categories.flatMap(({ models }) => models);
    const models =
        requestedModels == null
            ? allModels
            : requestedModels.map(
                  (id) =>
                      allModels.find((model) => model.id === id) ?? {
                          id,
                          label: id,
                      },
              );

    return (
        <div className="space-y-3">
            <Surface>
                <ul className="space-y-3 text-sm">
                    {showIdentity && (
                        <AuthAccessItem
                            checked
                            control={
                                <Chip size="sm" intent="neutral">
                                    Required
                                </Chip>
                            }
                        >
                            Username, picture and this key’s budget and usage.
                        </AuthAccessItem>
                    )}
                    <AccountPermissionsInput
                        value={permissions.accountPermissions}
                        onChange={(next) =>
                            setAccountPermissions(next.length ? next : null)
                        }
                        disabled={disabled}
                        visiblePermissions={visiblePermissions}
                    />
                </ul>
            </Surface>
            <Surface className="space-y-3">
                <ul className="text-sm">
                    <AuthAccessItem
                        checked={
                            permissions.allowedModels === null ||
                            permissions.allowedModels.length > 0
                        }
                    >
                        AI generation
                    </AuthAccessItem>
                </ul>
                <PollenBudgetInput
                    value={permissions.pollenBudget}
                    onChange={setPollenBudget}
                    disabled={disabled}
                    inline={inline}
                />
                <ModelPermissionsInput
                    catalog={catalog}
                    categories={categories}
                    models={models}
                    selected={permissions.allowedModels}
                    onChange={(next) =>
                        setAllowedModels(
                            requestedModels == null
                                ? normalizeAllowedModelSelection(
                                      next,
                                      models.map(({ id }) => id),
                                  )
                                : next,
                        )
                    }
                    disabled={disabled}
                    initiallyExpanded={permissions.allowedModels !== null}
                />
            </Surface>
            <Surface>
                <ExpiryDaysInput
                    value={permissions.expiryDays}
                    onChange={setExpiryDays}
                    disabled={disabled}
                    inline={inline}
                />
            </Surface>
        </div>
    );
};
