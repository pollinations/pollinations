import { Chip } from "@pollinations/ui";
import { AuthAccessItem, AuthInfoCard } from "@pollinations/ui/auth";
import type { FC } from "react";
import { useState } from "react";
import { useModelCategories } from "../models/use-model-categories.ts";
import { useOwnCommunityModels } from "../models/use-own-community-models.ts";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { KeyLimitInput } from "./key-limit-input.tsx";
import { ModelPermissionsInput } from "./model-permissions-input.tsx";
import { normalizeAllowedModelSelection } from "./model-selection.ts";

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

    const hasModels =
        permissions.allowedModels === null ||
        permissions.allowedModels.length > 0;
    return (
        <div className="space-y-4">
            <AuthInfoCard>
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
            </AuthInfoCard>
            <AuthInfoCard>
                <ul className="text-sm">
                    <AuthAccessItem
                        checked={hasModels}
                        disabled={disabled}
                        onChange={(checked) =>
                            setAllowedModels(
                                checked ? (requestedModels ?? null) : [],
                            )
                        }
                        details={
                            <div className="space-y-2">
                                <p>
                                    Allow this key to generate with selected
                                    models.
                                </p>
                                {hasModels && (
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
                                                          models.map(
                                                              ({ id }) => id,
                                                          ),
                                                      )
                                                    : next,
                                            )
                                        }
                                        disabled={disabled}
                                        initiallyExpanded={
                                            permissions.allowedModels !== null
                                        }
                                    />
                                )}
                            </div>
                        }
                    >
                        AI models
                    </AuthAccessItem>
                </ul>
            </AuthInfoCard>
            <AuthInfoCard>
                <ul className="space-y-3 text-sm">
                    <KeyLimitInput
                        kind="budget"
                        value={permissions.pollenBudget}
                        onChange={setPollenBudget}
                        disabled={disabled}
                    />
                    <KeyLimitInput
                        kind="expiry"
                        value={permissions.expiryDays}
                        onChange={setExpiryDays}
                        disabled={disabled}
                    />
                </ul>
            </AuthInfoCard>
        </div>
    );
};
