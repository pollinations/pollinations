import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import { getModalityColors } from "../models/modality-ui.ts";

type ModalityButtonProps = {
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
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-medium leading-normal transition-colors text-left",
                selected
                    ? (colors?.filled ?? "bg-gray-200 text-gray-900")
                    : "bg-gray-100 text-gray-600",
                !disabled && !selected && colors?.hover,
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
            )}
        >
            {children}
        </button>
    );
};
