import { Text } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";

const permissions = [
    {
        id: "profile",
        label: "Read profile",
        description: "Display name and email.",
    },
    {
        id: "usage",
        label: "Read account activity",
        description: "Balance, usage, earnings and quest status.",
    },
    {
        id: "keys",
        label: "Manage account resources",
        description: "API keys, agents, models and connected apps.",
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
        .map(({ id, label, description }) => (
            <AuthAccessItem
                key={id}
                details={
                    <Text size="xs" tone="muted">
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
