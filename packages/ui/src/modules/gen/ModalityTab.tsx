import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import {
    tabButtonBaseClass,
    tabButtonSizeClass,
} from "../../primitives/TabButton.tsx";
import { getModalityKey, modalityBgVar, modalityColorVar } from "./themes.ts";

/** `"all"` is the no-filter option (rendered in the app accent, not a modality). */
export type ModalityTabValue = string | "all";

/**
 * A pill colored as a model modality (or the app accent for `"all"`). One bg
 * rule for every state: transparent when idle, tinted on hover, deeper when
 * selected — so the colored label/border carry the contrast. `bordered`
 * (default) keeps the `TabButton` 1px border for filter tabs; `bordered={false}`
 * drops it for multi-select toggles, where a border would read as a tab.
 *
 * Colors come only from the `--polli-color-modality-*` tokens (or the themed
 * accent tokens); the modality label is blended toward `text-strong` to stay
 * readable in light and dark.
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
    modality: ModalityTabValue;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
    /** 1px border — on for filter tabs, off for multi-select toggles. */
    bordered?: boolean;
    disabled?: boolean;
    className?: string;
}) {
    const key = modality === "all" ? null : getModalityKey(modality);
    // Palette: per-modality tokens, or the themed accent for "all"/unknown.
    const palette = key
        ? {
              text: `color-mix(in oklab, ${modalityColorVar(key)} 72%, var(--polli-color-text-strong))`,
              border: modalityColorVar(key),
              hover: modalityBgVar(key),
              activeBg: `color-mix(in oklab, ${modalityColorVar(key)} 28%, ${modalityBgVar(key)})`,
          }
        : {
              text: "var(--polli-color-text-base)",
              border: "var(--polli-color-border)",
              hover: "var(--polli-color-bg-subtle)",
              activeBg: "var(--polli-color-bg-active)",
          };
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            disabled={disabled}
            style={
                {
                    color: palette.text,
                    "--mod-hover": palette.hover,
                    // idle = transparent (more contrast); selected = deeper tint;
                    // hover handled by the class below.
                    backgroundColor: active ? palette.activeBg : undefined,
                    borderColor: bordered ? palette.border : undefined,
                } as CSSProperties
            }
            className={cn(
                tabButtonBaseClass,
                tabButtonSizeClass[size],
                bordered && "polli:border",
                disabled
                    ? "polli:cursor-not-allowed polli:opacity-50"
                    : "polli:cursor-pointer",
                !active && !disabled && "polli:hover:bg-[var(--mod-hover)]",
                className,
            )}
        >
            {children}
        </button>
    );
}
