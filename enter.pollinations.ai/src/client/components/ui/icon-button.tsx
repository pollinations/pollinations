import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";

const iconButtonColors = {
    blue: "bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600",
    red: "bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600",
    gray: "bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600",
} as const;

type IconButtonProps = {
    color?: keyof typeof iconButtonColors;
    title?: string;
    onClick: () => void;
    children: ReactNode;
    className?: string;
};

export const IconButton: FC<IconButtonProps> = ({
    color = "gray",
    title,
    onClick,
    children,
    className,
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className={cn(
            "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors",
            iconButtonColors[color],
            className,
        )}
    >
        {children}
    </button>
);
