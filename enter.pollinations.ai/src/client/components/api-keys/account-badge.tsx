import type { FC } from "react";
import { Badge } from "../ui/badge.tsx";

export const AccountBadge: FC<{
    permissions: Record<string, string[]> | null;
}> = ({ permissions }) => {
    const account = permissions?.account ?? null;
    if (!account || account.length === 0) return null;

    return (
        <>
            {account.map((perm) => (
                <Badge key={perm} color="violet" size="sm">
                    {perm}
                </Badge>
            ))}
        </>
    );
};
