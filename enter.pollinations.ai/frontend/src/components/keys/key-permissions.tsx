import { AccountIcon, InfoTip } from "@pollinations/ui";
import { AuthAccessItem, AuthInfoCard } from "@pollinations/ui/auth";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import type { FC, ReactNode } from "react";
import { useRef, useState } from "react";
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
    /** Default selection when enabling generation for the first time. */
    requestedModels?: string[] | null;
    /** Key editors put the name in the same card as the limits. */
    nameField?: ReactNode;
    /** Disclosure shown after all permission controls on consent. */
    permissionsAfter?: ReactNode;
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
    nameField,
    permissionsAfter,
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
    const generateInput = useRef<HTMLInputElement>(null);
    const [previousModels, setPreviousModels] = useState<string[] | null>(
        requestedModels?.length ? requestedModels : null,
    );

    const hasModels =
        permissions.allowedModels === null ||
        permissions.allowedModels.length > 0;
    const changeModels = (models: string[] | null) => {
        if (hasModels) setPreviousModels(permissions.allowedModels);
        if (models?.length === 0) generateInput.current?.focus();
        setAllowedModels(models);
    };
    const accountPermissionProps = {
        value: permissions.accountPermissions,
        onChange: (next: string[]) =>
            setAccountPermissions(next.length ? next : null),
        disabled,
        visiblePermissions,
    };
    const limitInputs = (
        <>
            <KeyLimitInput
                kind="budget"
                accessContext={accessContext}
                value={permissions.pollenBudget}
                onChange={setPollenBudget}
                disabled={disabled}
            />
            <AuthAccessItem
                checked={permissions.questPollenOnly}
                onChange={setQuestPollenOnly}
                disabled={disabled}
                info={
                    <InfoTip
                        text={`This ${accessContext ?? "key"} never spends paid pollen. Requests stop when Quest pollen runs out.`}
                        label="Quest pollen only information"
                    />
                }
            >
                <span className="inline-flex items-center gap-1.5">
                    <WalletKindIcon kind="tier" />
                    Quest pollen only
                </span>
            </AuthAccessItem>
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
            inputRef={generateInput}
            checked={hasModels}
            disabled={disabled}
            onChange={(checked) => changeModels(checked ? previousModels : [])}
        >
            Generate
        </AuthAccessItem>
    );
    return (
        <div className="space-y-3">
            <AuthInfoCard title={nameField ? "Settings" : "Limits"}>
                <div className="@container grid gap-2">
                    {nameField && <ul className="text-sm">{nameField}</ul>}
                    <ul className="grid w-full grid-cols-1 items-center gap-x-6 gap-y-2 text-sm @min-[35rem]:grid-cols-[18rem_minmax(0,1fr)]">
                        {limitInputs}
                    </ul>
                </div>
            </AuthInfoCard>
            <AuthInfoCard title="Permissions">
                <div className="grid gap-2">
                    <ul className="grid grid-cols-1 gap-y-2 text-sm">
                        <AuthAccessItem icon={<AccountIcon />}>
                            <span className="inline-flex items-center">
                                See your username and picture
                                <InfoTip
                                    text={`This ${accessContext ?? "key"} can access your username, profile picture and its own budget and usage.`}
                                    label="See your username and picture information"
                                />
                            </span>
                        </AuthAccessItem>
                        <AccountPermissionsInput
                            {...accountPermissionProps}
                            section="account"
                        />
                    </ul>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]">
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
                            onChange={changeModels}
                            disabled={disabled || !hasModels}
                        />
                    </div>
                    {(!visiblePermissions ||
                        visiblePermissions.has("machines")) && (
                        <ul className="text-sm">
                            <AccountPermissionsInput
                                {...accountPermissionProps}
                                section="tools"
                            />
                        </ul>
                    )}
                    {permissionsAfter != null && (
                        <ul className="text-sm">{permissionsAfter}</ul>
                    )}
                </div>
            </AuthInfoCard>
        </div>
    );
};
