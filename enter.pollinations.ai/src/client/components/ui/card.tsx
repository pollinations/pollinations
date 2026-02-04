import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";

const cardColors = {
    amber: "border-amber-300",
    blue: "border-blue-300",
    violet: "border-violet-200",
    teal: "border-teal-200",
    red: "border-red-300",
    yellow: "border-yellow-200",
    gray: "border-gray-200",
} as const;

type CardProps = PropsWithChildren<{
    color?: keyof typeof cardColors;
    bg?: string;
    className?: string;
}>;

export const Card: FC<CardProps> = ({
    color = "gray",
    bg = "bg-white/50",
    className,
    children,
}) => (
    <div
        className={cn(
            "rounded-xl border shadow-sm p-4",
            cardColors[color],
            bg,
            className,
        )}
    >
        {children}
    </div>
);
