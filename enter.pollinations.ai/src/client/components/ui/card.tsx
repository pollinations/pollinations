import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";
import { cardColors } from "../layout/dashboard-theme.ts";

type CardProps = PropsWithChildren<{
    color?: keyof typeof cardColors;
    bg?: string;
    className?: string;
}>;

export const Card: FC<CardProps> = ({
    color = "gray",
    bg = "bg-white/80",
    className,
    children,
}) => (
    <div
        className={cn(
            "min-w-0 rounded-xl border p-4",
            cardColors[color],
            bg,
            className,
        )}
    >
        {children}
    </div>
);
