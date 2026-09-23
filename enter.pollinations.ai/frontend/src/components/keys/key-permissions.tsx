import { InfoTip } from "@pollinations/ui";
import { AuthAccessItem, AuthInfoCard } from "@pollinations/ui/auth";
import type { FC, ReactNode } from "react";
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
    accessContext?: "app" | "device";
    visiblePermissions?: ReadonlySet<string>;
    requestedModels?: string[] | null;
    /** Required identity row on consent; key names are shown above this editor. */
    lead?: ReactNode;
    /** Fixed row shown after the optional account permissions on consent. */
    accountAfter?: ReactNode;
}

/**
 * Renders all key permission inputs
 */
export const KeyPermissionsInputs: FC<KeyPermissionsInputsProps> = ({
    value,
    disabled = false,
    accessContext,
    visiblePermissions,
    requestedModels,
    lead,
    accountAfter,
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
    const hasAccountCard =
        visiblePermissions === undefined ||
        visiblePermissions.size > 0 ||
        accountAfter != null;
    const accountPermissionsInput = (
        <AccountPermissionsInput
            value={permissions.accountPermissions}
            onChange={(next) =>
                setAccountPermissions(next.length ? next : null)
            }
            disabled={disabled}
            visiblePermissions={visiblePermissions}
        />
    );
    const limitInputs = (
        <>
            <KeyLimitInput
                kind="budget"
                accessContext={accessContext}
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                disabled={disabled}
            />
            <KeyLimitInput
                kind="expiry"
                accessContext={accessContext}
                value={permissions.expiryDays}
                onChange={setExpiryDays}
                disabled={disabled}
            />
        </>
    );
    const modelsItem = (
        <AuthAccessItem
            checked={hasModels}
            disabled={disabled}
            onChange={(checked) =>
                setAllowedModels(checked ? (requestedModels ?? null) : [])
            }
        >
            Generate
        </AuthAccessItem>
    );
    return (
        <div className="space-y-4">
            <div
                className={`grid items-start gap-4 [&_li>:first-child]:min-h-11 ${hasAccountCard ? "md:grid-cols-2" : ""}`}
            >
                <AuthInfoCard>
                    <ul className="space-y-3 text-sm">
                        {lead}
                        {limitInputs}
                    </ul>
                </AuthInfoCard>
                {hasAccountCard && (
                    <AuthInfoCard>
                        <ul className="space-y-3 text-sm">
                            {accountPermissionsInput}
                            {accountAfter}
                        </ul>
                    </AuthInfoCard>
                )}
            </div>
            <AuthInfoCard>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                    <div className="col-start-1 row-start-1 flex items-center">
                        <ul className="text-sm">{modelsItem}</ul>
                        <InfoTip
                            text={
                                accessContext
                                    ? `Choose which models this ${accessContext} can use.`
                                    : "Choose which models this key can use."
                            }
                            label="Generate information"
                        />
                    </div>
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
                    />
                </div>
            </AuthInfoCard>
        </div>
    );
};
