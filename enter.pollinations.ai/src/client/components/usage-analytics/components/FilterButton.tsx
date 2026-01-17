import type { FC } from "react";
import { cn } from "@/util.ts";

type FilterButtonProps = {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    ariaLabel?: string;
    className?: string;
};

export const FilterButton: FC<FilterButtonProps> = ({
    active,
    onClick,
    children,
    ariaLabel,
    className,
}) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200",
            active
                ? "bg-green-950 text-green-100"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            className,
        )}
    >
        {children}
    </button>
);
