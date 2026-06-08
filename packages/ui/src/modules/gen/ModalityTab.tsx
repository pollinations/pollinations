import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import {
    TabButton,
    tabButtonBaseClass,
    tabButtonSizeClass,
} from "../../primitives/TabButton.tsx";
import { getModalityKey, modalityBgVar, modalityColorVar } from "./themes.ts";

/** `"all"` is the no-filter option (rendered in the app accent, not a modality). */
export type ModalityTabValue = string | "all";

/**
 * A pill colored as a model modality. Same shape as `TabButton`, recolored by
 * the modality: tinted background + a modality-tinted label, deeper when active.
 *
 * `bordered` (default) keeps the `TabButton` 1px border in the modality color —
 * for filter tabs. `bordered={false}` drops it for multi-select toggles, where a
 * border would wrongly read as a tab. `"all"` (or an unknown category) falls back
 * to a normal accent `TabButton`.
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
    bordered = true,
    disabled = false,
    className,
}: {
    modality: ModalityTabValue;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
    /** 1px modality border — on for filter tabs, off for multi-select toggles. */
    bordered?: boolean;
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
    const color = modalityColorVar(key);
    const tint = modalityBgVar(key);
    // Bordered tabs always show a light tint (deeper when active), mirroring the
    // TabButton bg-subtle→bg-active step. Borderless toggles fill only when on.
    const background = bordered
        ? active
            ? `color-mix(in oklab, ${color} 28%, ${tint})`
            : tint
        : active
          ? tint
          : "transparent";
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            disabled={disabled}
            style={{
                color: `color-mix(in oklab, ${color} 72%, var(--polli-color-text-strong))`,
                backgroundColor: background,
                borderColor: bordered ? color : undefined,
            }}
            className={cn(
                tabButtonBaseClass,
                tabButtonSizeClass[size],
                bordered && "polli:border",
                disabled
                    ? "polli:cursor-not-allowed polli:opacity-50"
                    : "polli:cursor-pointer",
                className,
            )}
        >
            {children}
        </button>
    );
}
