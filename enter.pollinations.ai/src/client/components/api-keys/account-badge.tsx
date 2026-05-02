import type { FC } from "react";
import { Tag } from "../ui/tag.tsx";

export const AccountBadge: FC<{
    permissions: Record<string, string[]> | null;
}> = ({ permissions }) => {
    const account = permissions?.account ?? null;
    if (!account || account.length === 0) return null;

    return (
        <>
            {account.map((perm) => (
                <Tag key={perm} color="violet" size="sm">
                    {perm}
                </Tag>
            ))}
        </>
    );
};
