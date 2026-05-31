import type { FC } from "react";
import { cn } from "../lib/cn.ts";
import { Chip, type ChipProps } from "../primitives/Chip.tsx";

export type WalletChipProps = Omit<ChipProps, "intent">;

export const PaidChip: FC<WalletChipProps> = ({
    className,
    children,
    ...props
}) => (
    <Chip {...props} className={cn("polli-wallet-chip-paid", className)}>
        {children}
    </Chip>
);

export const TierChip: FC<WalletChipProps> = ({
    className,
    children,
    ...props
}) => (
    <Chip {...props} className={cn("polli-wallet-chip-tier", className)}>
        {children}
    </Chip>
);
