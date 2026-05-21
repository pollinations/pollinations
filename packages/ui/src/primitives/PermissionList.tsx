import { useAuthActions } from "@pollinations_ai/sdk/react";
import { cn } from "../lib/cn.ts";
import { Chip } from "../ui/chip.tsx";

export type PermissionListProps = {
    className?: string;
};

/** Renders one `<Chip>` per provider-configured permission. */
export function PermissionList({ className }: PermissionListProps) {
    const { permissions } = useAuthActions();
    if (permissions.length === 0) return null;
    return (
        <div
            data-polli="permission-list"
            className={cn(
                "polli:flex polli:flex-wrap polli:gap-1.5",
                className,
            )}
        >
            {permissions.map((perm) => (
                <Chip key={perm} intent="neutral" size="sm">
                    {perm}
                </Chip>
            ))}
        </div>
    );
}
