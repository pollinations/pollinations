import type { FC, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { getModalityColors } from "./colors.ts";

export type ModalityButtonProps = {
    /** Modality key or category string ("Text", "Images", etc). */
    category?: string;
    /** Filled (modality hue) when true, muted gray when false. */
    selected?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
};

/**
 * Rounded-full pill button colored by modality. Single source of truth
 * for every interactive modality affordance — model picker, design
 * showcase, etc. Shape and recipe live here; consumers only supply
 * content + state.
 */
export const ModalityButton: FC<ModalityButtonProps> = ({
    category,
    selected = true,
    onClick,
    disabled,
    children,
}) => {
    const colors = getModalityColors(category ?? "");
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
                "polli:inline-flex polli:shrink-0 polli:items-center polli:gap-1 polli:rounded-full polli:px-3 polli:py-1 polli:text-left polli:text-sm polli:font-medium polli:leading-normal polli:transition-colors",
                selected
                    ? (colors?.filled ??
                          "polli:bg-gray-200 polli:text-gray-900")
                    : "polli:bg-gray-100 polli:text-gray-600",
                !disabled && !selected && colors?.hover,
                disabled
                    ? "polli:cursor-not-allowed polli:opacity-50"
                    : "polli:cursor-pointer",
            )}
        >
            {children}
        </button>
    );
};
