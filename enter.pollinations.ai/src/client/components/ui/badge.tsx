import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";

const badgeColors = {
    gray: "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100",
    green: "bg-green-200 text-gray-900 dark:bg-green-800 dark:text-gray-100",
    pink: "bg-pink-200 text-gray-900 dark:bg-pink-800 dark:text-gray-100",
    amber: "bg-orange-200 text-gray-900 dark:bg-orange-800 dark:text-gray-100",
    blue: "bg-blue-200 text-gray-900 dark:bg-blue-800 dark:text-gray-100",
    purple: "bg-purple-200 text-gray-900 dark:bg-purple-800 dark:text-gray-100",
    violet: "bg-violet-200 text-gray-900 dark:bg-violet-800 dark:text-gray-100",
    teal: "bg-teal-200 text-gray-900 dark:bg-teal-800 dark:text-gray-100",
    yellow: "bg-yellow-200 text-gray-900 dark:bg-yellow-800 dark:text-gray-100",
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
