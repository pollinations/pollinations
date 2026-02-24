import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";

const badgeColors = {
    gray: "bg-gray-100 border-gray-400 text-gray-800",
    green: "bg-emerald-100 border-emerald-400 text-emerald-800",
    pink: "bg-fuchsia-100 border-fuchsia-400 text-fuchsia-800",
    amber: "bg-amber-100 border-amber-400 text-amber-800",
    blue: "bg-blue-100 border-blue-400 text-blue-800",
    purple: "bg-purple-100 border-purple-400 text-purple-800",
    violet: "bg-violet-100 border-violet-300 text-violet-700",
    teal: "bg-teal-200 border-teal-400 text-teal-800",
    yellow: "bg-yellow-100 border-yellow-400 text-yellow-800",
} as const;

const badgeSizes = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-xs",
    lg: "px-3 py-1 text-sm",
} as const;

type BadgeProps = PropsWithChildren<{
    color?: keyof typeof badgeColors;
    size?: keyof typeof badgeSizes;
    className?: string;
}>;

export const Badge: FC<BadgeProps> = ({
    color = "gray",
    size = "md",
    className,
    children,
}) => (
    <span
        className={cn(
            "inline-flex items-center gap-1 rounded-full border font-medium",
            badgeSizes[size],
            badgeColors[color],
            className,
        )}
    >
        {children}
    </span>
);
