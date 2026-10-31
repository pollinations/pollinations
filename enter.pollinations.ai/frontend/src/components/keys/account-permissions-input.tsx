import { BeakerIcon, Tooltip, WarningIcon } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";

export const accountPermissions = [
    {
        id: "profile",
        section: "account",
        label: "See your name and email",
    },
    {
        id: "usage",
        section: "account",
        label: "See balance, usage, earnings and quests",
    },
    {
        id: "keys",
        section: "account",
        label: "Manage keys, agents and models",
    },
    {
        id: "machines",
        section: "tools",
        label: "Run hosted sandboxes",
    },
    {
        id: "sites",
        section: "tools",
        label: "Publish sites on pollinations.app",
    },
] as const;

/**
 * Shown wherever a key can get `keys`: keys it creates don't inherit its
 * budget, so it can spend the whole balance.
 */
export function KeysPermissionWarning() {
    return (
        <span className="inline-flex items-center gap-1">
            <WarningIcon
                className="h-3.5 w-3.5 shrink-0 text-intent-warning-text"
                aria-hidden="true"
            />
            Be careful: only allow this for apps you trust.
        </span>
    );
}

/** The same optional grants in dashboard keys and connection consent. */
export function AccountPermissionsInput({
    value,
    onChange,
    disabled = false,
    visiblePermissions,
    section,
}: {
    value: string[] | null;
    onChange: (permissions: string[]) => void;
    disabled?: boolean;
    visiblePermissions?: ReadonlySet<string>;
    section: "account" | "tools";
}) {
    return accountPermissions
        .filter(
            (permission) =>
                permission.section === section &&
                (!visiblePermissions || visiblePermissions.has(permission.id)),
        )
        .map(({ id, label }) => (
            <AuthAccessItem
                key={id}
                checked={value?.includes(id) ?? false}
                disabled={disabled}
                details={id === "keys" ? <KeysPermissionWarning /> : undefined}
                info={
                    id === "machines" ? (
                        <Tooltip
                            content="Alpha. Experimental and may be unstable."
                            ariaLabel="Sandboxes are in alpha"
                            tapEnabled
                            className="ml-1.5 inline-flex items-center text-intent-info-text"
                        >
                            <span className="inline-flex items-center gap-1 text-xs">
                                <BeakerIcon
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                />
                                alpha
                            </span>
                        </Tooltip>
                    ) : undefined
                }
                onChange={(checked) =>
                    onChange(
                        checked
                            ? [...new Set([...(value ?? []), id])]
                            : (value ?? []).filter(
                                  (permission) => permission !== id,
                              ),
                    )
                }
            >
                {label}
            </AuthAccessItem>
        ));
}
