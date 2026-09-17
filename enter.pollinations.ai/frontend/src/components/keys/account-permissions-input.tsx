import { AuthAccessItem } from "@pollinations/ui/auth";

const permissions = [
    {
        id: "profile",
        label: "Display name and email.",
        ariaLabel: "Share display name and email",
    },
    {
        id: "usage",
        label: "Balance, usage, earnings and quest status.",
        ariaLabel: "Share account activity",
    },
    {
        id: "keys",
        label: "API keys, agents, models and connected apps.",
        ariaLabel: "Allow account management",
    },
] as const;

/** The same optional grants in dashboard keys and connection consent. */
export function AccountPermissionsInput({
    value,
    onChange,
    disabled = false,
    visiblePermissions,
}: {
    value: string[] | null;
    onChange: (permissions: string[]) => void;
    disabled?: boolean;
    visiblePermissions?: ReadonlySet<string>;
}) {
    return permissions
        .filter(({ id }) => !visiblePermissions || visiblePermissions.has(id))
        .map(({ id, label, ariaLabel }) => (
            <AuthAccessItem
                key={id}
                ariaLabel={ariaLabel}
                checked={value?.includes(id) ?? false}
                disabled={disabled}
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
