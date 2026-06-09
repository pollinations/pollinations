import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import {
    tabButtonBaseClass,
    tabButtonSizeClass,
} from "../../primitives/TabButton.tsx";
import { getModalityKey, modalityBgVar, modalityColorVar } from "./themes.ts";

/**
 * A pill carrying a model modality's color on its border + fill; the label stays
 * the strong (black) text token. No transparency: idle is the opaque card
 * surface, and hover and selected both use the same strengthened modality fill.
 * `bordered`
 * (default) keeps the `TabButton` 1px border + surface fill for filter tabs;
 * `bordered={false}` drops both for multi-select toggles (transparent until
 * hovered/selected), where a border would read as a tab.
 *
 * Colors come only from the `--polli-color-modality-*` tokens (or the themed
 * accent tokens for an unknown modality) — no hardcoded values.
 */
export function ModalityTab({
    modality,
    active,
    onClick,
    children,
    size = "md",
    bordered = true,
    disabled = false,
    className,
}: {
    modality: string;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
    /** 1px border — on for filter tabs, off for multi-select toggles. */
    bordered?: boolean;
    disabled?: boolean;
    className?: string;
}) {
    const key = getModalityKey(modality);
    // Modality tokens, or the themed accent for an unknown modality. The fill is
    // strengthened toward the solid modality color so the selected (and hover)
    // background reads clearly — still token-only, no hardcoded values.
    const fill = key
        ? `color-mix(in oklab, ${modalityColorVar(key)} 30%, ${modalityBgVar(key)})`
        : "var(--polli-color-bg-active)";
    const border = key ? modalityColorVar(key) : "var(--polli-color-border)";
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            disabled={disabled}
            style={
                {
                    color: "var(--polli-color-text-strong)",
                    "--mod-fill": fill,
                    // Selected fills inline so it always wins; hover matches it
                    // via the class below. Idle uses the opaque surface CLASS
                    // (not inline) so :hover can override it.
                    backgroundColor: active ? fill : undefined,
                    borderColor: bordered ? border : undefined,
                } as CSSProperties
            }
            className={cn(
                tabButtonBaseClass,
                tabButtonSizeClass[size],
                bordered && "polli:border",
                bordered && !active && "polli:bg-surface-opaque",
                disabled
                    ? "polli:cursor-not-allowed polli:opacity-50"
                    : "polli:cursor-pointer",
                !active && !disabled && "polli:hover:bg-[var(--mod-fill)]",
                className,
            )}
        >
            {children}
        </button>
    );
}
