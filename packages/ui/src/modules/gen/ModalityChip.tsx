import type { ReactNode } from "react";
import { Chip } from "../../primitives/Chip.tsx";
import { getModalityKey, modalityBgVar, modalityColorVar } from "./themes.ts";

/**
 * A `Chip` colored as a model modality: faint modality background + a readable
 * modality-tinted label. The single-accent way to say "this is the <text/image/…>
 * modality" without theming the surrounding chrome.
 *
 * Colors come only from the `--polli-color-modality-*` tokens (via the helpers);
 * the label is blended toward `text-strong` so it stays readable on the faint
 * background in both light and dark. Unknown category → a plain neutral chip.
 */
export function ModalityChip({
    modality,
    size = "sm",
    className,
    children,
}: {
    modality: string;
    size?: "sm" | "md" | "lg";
    className?: string;
    children: ReactNode;
}) {
    const key = getModalityKey(modality);
    if (!key) {
        return (
            <Chip intent="neutral" size={size} className={className}>
                {children}
            </Chip>
        );
    }
    return (
        <Chip
            size={size}
            className={className}
            style={{
                backgroundColor: modalityBgVar(key),
                color: `color-mix(in oklab, ${modalityColorVar(key)} 72%, var(--polli-color-text-strong))`,
            }}
        >
            {children}
        </Chip>
    );
}
