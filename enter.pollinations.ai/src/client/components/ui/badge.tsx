import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";

const badgeColors = {
    gray: "bg-gray-200 text-gray-900",
    green: "bg-green-200 text-gray-900",
    pink: "bg-pink-200 text-gray-900",
    amber: "bg-orange-200 text-gray-900",
    blue: "bg-blue-200 text-gray-900",
    purple: "bg-purple-200 text-gray-900",
    violet: "bg-violet-200 text-gray-900",
    teal: "bg-teal-200 text-gray-900",
    yellow: "bg-yellow-200 text-gray-900",
} as const;

const badgeSizes = {
    sm: "px-2.5 py-0.5 text-xs",
    md: "px-2.5 py-0.5 text-sm",
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
            "inline-flex items-center gap-1 rounded-full font-medium leading-normal",
            badgeSizes[size],
            badgeColors[color],
            className,
        )}
    >
        {children}
    </span>
);
