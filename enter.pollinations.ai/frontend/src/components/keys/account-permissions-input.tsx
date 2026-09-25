import { AuthAccessItem } from "@pollinations/ui/auth";

const permissions = [
    {
        id: "profile",
        label: "See your name and email.",
    },
    {
        id: "usage",
        label: "View balance, usage, earnings and quests.",
    },
    {
        id: "keys",
        label: "Manage keys, agents and models.",
    },
    {
        id: "machines",
        label: "Run hosted machines, billed per hour.",
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
        .map(({ id, label }) => (
            <AuthAccessItem
                key={id}
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
