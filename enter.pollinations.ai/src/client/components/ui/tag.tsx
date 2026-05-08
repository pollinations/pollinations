import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../../../util.ts";

const tagColors = {
    gray: "bg-gray-200 text-gray-900",
    green: "bg-green-200 text-gray-900",
    pink: "bg-pink-200 text-gray-900",
    amber: "bg-amber-200 text-amber-900",
    orange: "bg-orange-300 text-orange-950",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-200 text-gray-900",
    violet: "bg-violet-200 text-violet-950",
    teal: "bg-teal-200 text-gray-900",
    yellow: "bg-yellow-200 text-gray-900",
} as const;

const tagSizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-0.5 text-sm",
    lg: "px-3 py-1 text-sm",
} as const;

type TagProps = ComponentPropsWithoutRef<"span"> & {
    color?: keyof typeof tagColors;
    size?: keyof typeof tagSizes;
};

// Rectangular informational label. Use for non-actionable indicators
// (status, scope, count, type). Round shapes are reserved for buttons.
export const Tag: FC<TagProps> = ({
    color = "gray",
    size = "md",
    className,
    children,
    ...rest
}) => (
    <span
        {...rest}
        className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium leading-normal shrink-0",
            tagSizes[size],
            tagColors[color],
            className,
        )}
    >
        {children}
    </span>
);
