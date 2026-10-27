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
] as const;

/** The same optional grants in dashboard keys and connection consent. */
export function AccountPermissionsInput({
    value,
    onChange,
    disabled = false,
    visiblePermissions,
    section,
    accessContext,
}: {
    value: string[] | null;
    onChange: (permissions: string[]) => void;
    disabled?: boolean;
    visiblePermissions?: ReadonlySet<string>;
    section: "account" | "tools";
    accessContext?: "app" | "device";
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
                info={
                    id === "keys" ? (
                        // Keys created with this permission don't inherit
                        // the budget.
                        <Tooltip
                            content={`This ${accessContext ?? "key"} can create new keys without a budget, so it could spend all your pollen.`}
                            ariaLabel="Managing keys can spend all your pollen"
                            tapEnabled
                            className="ml-1.5 inline-flex items-center text-intent-warning-text"
                        >
                            <span className="inline-flex items-center gap-1 text-xs">
                                <WarningIcon
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                />
                                can spend all your pollen
                            </span>
                        </Tooltip>
                    ) : id === "machines" ? (
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
