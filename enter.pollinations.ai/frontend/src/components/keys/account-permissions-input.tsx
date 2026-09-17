import { AccountIcon, KeyIcon, Text, UsageIcon } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";

const permissions = [
    {
        id: "profile",
        label: "Read profile",
        description: "Display name and email.",
        icon: AccountIcon,
    },
    {
        id: "usage",
        label: "Read account activity",
        description: "Balance, usage, earnings and quest status.",
        icon: UsageIcon,
    },
    {
        id: "keys",
        label: "Manage account resources",
        description: "API keys, agents, models and connected apps.",
        icon: KeyIcon,
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
        .map(({ id, label, description, icon: Icon }) => (
            <AuthAccessItem
                key={id}
                details={
                    <Text
                        size="xs"
                        tone="muted"
                        className="flex items-center gap-1.5"
                    >
                        <Icon
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0"
                        />
                        {description}
                    </Text>
                }
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
