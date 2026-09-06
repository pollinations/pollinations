import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "./ChevronIcon.tsx";

export type TableDisclosureButtonProps = {
    children: ReactNode;
    disabled?: boolean;
    expanded: boolean;
    onClick: () => void;
    className?: string;
};

/** Compact disclosure trigger for expandable table rows. */
export const TableDisclosureButton: FC<TableDisclosureButtonProps> = ({
    children,
    disabled = false,
    expanded,
    onClick,
    className,
}) => (
    <button
        type="button"
        aria-expanded={expanded}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            "polli-control polli:inline-flex polli:items-center polli:gap-1.5 polli:rounded-sm polli:text-left polli:text-theme-text-strong polli:transition-colors",
            disabled
                ? "polli:cursor-default polli:opacity-60"
                : "polli:cursor-pointer polli:hover:text-theme-text-soft",
            className,
        )}
    >
        <ChevronIcon
            expanded={expanded}
            className="polli:text-theme-text-soft"
        />
        {children}
    </button>
);
