import { CheckIcon, InfoTip } from "@pollinations/ui";
import { AuthAccessItem, AuthInfoCard } from "@pollinations/ui/auth";
import type { FC, ReactNode } from "react";
import { useId, useState } from "react";
import { useModelCatalog } from "../models/use-model-catalog.ts";
import { AccountPermissionsInput } from "./account-permissions-input.tsx";
import { KeyLimitInput } from "./key-limit-input.tsx";
import { ModelPermissionsInput } from "./model-permissions-input.tsx";

export interface KeyPermissions {
    allowedModels: string[] | null;
    pollenBudget: number | null;
    expiryDays: number | null;
    accountPermissions: string[] | null;
    questPollenOnly: boolean;
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
    const [questPollenOnly, setQuestPollenOnly] = useState(
        initial.questPollenOnly ?? false,
    );

    return {
        permissions: {
            allowedModels,
            pollenBudget,
            expiryDays,
            accountPermissions,
            questPollenOnly,
        },
        setAllowedModels,
        setPollenBudget,
        setExpiryDays,
        setAccountPermissions,
        setQuestPollenOnly,
    };
}

interface KeyPermissionsInputsProps {
    value: ReturnType<typeof useKeyPermissions>;
    disabled?: boolean;
    accessContext?: "app" | "device";
    visiblePermissions?: ReadonlySet<string>;
    /** The app's request: preselected, and restored when Generate is re-ticked. */
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
        setQuestPollenOnly,
    } = value;
    const catalog = useModelCatalog();
    const questPollenOnlyId = useId();

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
    // Expiry, Budget and the Quest Pollen toggle share one thin line, like
    // the Name and Generate rows. Each control group stays intact when the
    // line wraps on narrow screens.
    const limitInputs = (
        <li className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2 font-body text-sm font-semibold leading-5">
            <KeyLimitInput
                kind="expiry"
                accessContext={accessContext}
                value={permissions.expiryDays}
                onChange={setExpiryDays}
                disabled={disabled}
                inline
            />
            <KeyLimitInput
                kind="budget"
                accessContext={accessContext}
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                disabled={disabled}
                inline
            />
            <span className="flex w-full shrink-0 items-center gap-3 whitespace-nowrap sm:w-auto">
                <label
                    htmlFor={questPollenOnlyId}
                    className={`flex items-center gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                    <span className="relative flex h-5 w-5 shrink-0">
                        <input
                            id={questPollenOnlyId}
                            type="checkbox"
                            checked={permissions.questPollenOnly}
                            disabled={disabled}
                            onChange={(event) =>
                                setQuestPollenOnly(event.target.checked)
                            }
                            className="peer sr-only"
                        />
                        <span
                            aria-hidden="true"
                            className="flex h-5 w-5 items-center justify-center rounded border border-theme-text-muted/50 bg-transparent transition-colors peer-checked:border-theme-bg-active peer-checked:bg-theme-bg-active peer-checked:text-theme-text-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-theme-text-soft peer-disabled:opacity-50"
                        >
                            {permissions.questPollenOnly && (
                                <CheckIcon className="h-3.5 w-3.5" />
                            )}
                        </span>
                    </span>
                    <span
                        className={`transition-opacity ${permissions.questPollenOnly ? "" : "opacity-60"}`}
                    >
                        Quest Pollen only
                    </span>
                </label>
                <InfoTip
                    text={`This ${accessContext ?? "key"} never spends paid Pollen. Requests stop when Quest Pollen runs out.`}
                    label="Quest Pollen only information"
                />
            </span>
        </li>
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
        <div className="space-y-3">
            <div
                className={`grid items-start gap-3 ${hasAccountCard ? "md:grid-cols-2" : ""}`}
            >
                {/* Full width so the three limits stay on one thin line even
                    when the account card sits beside/below. */}
                <div className={hasAccountCard ? "md:col-span-2" : ""}>
                    <AuthInfoCard>
                        <ul className="space-y-3 text-sm">
                            {lead}
                            {limitInputs}
                        </ul>
                    </AuthInfoCard>
                </div>
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
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]">
                    <div className="col-start-1 row-start-1 flex items-center">
                        <ul className="text-sm">{modelsItem}</ul>
                        <InfoTip
                            text={`Choose which kinds of models this ${accessContext ?? "key"} can use. New models in a chosen category are included.`}
                            label="Generate information"
                        />
                    </div>
                    <ModelPermissionsInput
                        catalog={catalog}
                        selected={permissions.allowedModels}
                        onChange={setAllowedModels}
                        disabled={disabled}
                    />
                </div>
            </AuthInfoCard>
        </div>
    );
};
