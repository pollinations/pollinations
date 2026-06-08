import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import {
    TabButton,
    tabButtonBaseClass,
    tabButtonSizeClass,
} from "../../primitives/TabButton.tsx";
import { ModalityDot } from "./ModalityDot.tsx";
import { getModalityKey, modalityBgVar, modalityColorVar } from "./themes.ts";

/** `"all"` is the no-filter option (rendered in the app accent, not a modality). */
export type ModalityTabValue = string | "all";

/**
 * A pill toggle colored as a model modality — used both for the model-filter
 * tabs and the per-model permission toggles. Active = faint modality fill + a
 * solid modality ring + bold; inactive = modality-tinted label (+ dot). `"all"`
 * (or an unknown category) falls back to a normal accent `TabButton`, since it
 * is not a modality. Reuses `TabButton`'s pill shape so the two always match.
 *
 * Colors come only from the `--polli-color-modality-*` tokens (via the helpers);
 * the label is blended toward `text-strong` to stay readable in light and dark.
 */
export function ModalityTab({
    modality,
    active,
    onClick,
    children,
    size = "md",
    dot = true,
    disabled = false,
    className,
}: {
    modality: ModalityTabValue;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
    /** Leading modality dot. Off when a shared header already shows the color. */
    dot?: boolean;
    disabled?: boolean;
    className?: string;
}) {
    const key = modality === "all" ? null : getModalityKey(modality);
    if (!key) {
        return (
            <TabButton
                active={active}
                onClick={onClick}
                size={size}
                disabled={disabled}
                className={className}
            >
                {children}
            </TabButton>
        );
    }
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            disabled={disabled}
            style={
                {
                    "--mod-bg": modalityBgVar(key),
                    color: `color-mix(in oklab, ${modalityColorVar(key)} 72%, var(--polli-color-text-strong))`,
                    backgroundColor: active
                        ? modalityBgVar(key)
                        : "transparent",
                    borderColor: active ? modalityColorVar(key) : "transparent",
                } as CSSProperties
            }
            className={cn(
                tabButtonBaseClass,
                tabButtonSizeClass[size],
                "polli:gap-1.5 polli:border",
                active && "polli:font-semibold",
                disabled
                    ? "polli:cursor-not-allowed polli:opacity-50"
                    : "polli:cursor-pointer",
                !active && !disabled && "polli:hover:bg-[var(--mod-bg)]",
                className,
            )}
        >
            {dot ? <ModalityDot modality={key} /> : null}
            {children}
        </button>
    );
}
