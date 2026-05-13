import type { FC } from "react";
import { Chip } from "../ui/chip.tsx";

export const AccountBadge: FC<{
    permissions: Record<string, string[]> | null;
}> = ({ permissions }) => {
    const account = permissions?.account ?? null;
    if (!account || account.length === 0) return null;

    return (
        <>
            {account.map((perm) => (
                <Chip key={perm} theme="violet" size="sm">
                    {perm}
                </Chip>
            ))}
        </>
    );
};
