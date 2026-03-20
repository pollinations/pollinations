import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";

const cardColors = {
    amber: "border-amber-300 dark:border-amber-700",
    blue: "border-blue-300 dark:border-blue-700",
    green: "border-green-300 dark:border-green-700",
    violet: "border-violet-200 dark:border-violet-700",
    purple: "border-purple-300 dark:border-purple-700",
    teal: "border-teal-200 dark:border-teal-700",
    red: "border-red-300 dark:border-red-700",
    yellow: "border-yellow-200 dark:border-yellow-700",
    gray: "border-gray-200 dark:border-gray-600",
    pink: "border-pink-300 dark:border-pink-700",
} as const;

type CardProps = PropsWithChildren<{
    color?: keyof typeof cardColors;
    bg?: string;
    className?: string;
}>;

export const Card: FC<CardProps> = ({
    color = "gray",
    bg = "bg-white/80 dark:bg-gray-800/80",
    className,
    children,
}) => (
    <div
        className={cn(
            "rounded-xl border p-4",
            cardColors[color],
            bg,
            className,
        )}
    >
        {children}
    </div>
);
