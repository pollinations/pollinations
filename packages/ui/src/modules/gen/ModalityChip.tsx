import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { Chip } from "../../primitives/Chip.tsx";
import { ModalityDot } from "./ModalityDot.tsx";
import { getModalityKey, modalityBgVar, modalityColorVar } from "./themes.ts";

/**
 * A `Chip` colored as a model modality: faint modality background + a readable
 * modality-tinted label + the modality dot. The single-accent way to say "this
 * is the <text/image/…> modality" without theming the surrounding chrome.
 *
 * Colors come only from the `--polli-color-modality-*` tokens (via the helpers);
 * the label is blended toward `text-strong` so it stays readable on the faint
 * background in both light and dark. Unknown category → a plain neutral chip.
 */
export function ModalityChip({
    modality,
    size = "sm",
    dot = true,
    className,
    children,
}: {
    modality: string;
    size?: "sm" | "md" | "lg";
    /** Leading modality dot. Off when the content already conveys it (e.g. emoji). */
    dot?: boolean;
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
            className={cn("polli:gap-1.5", className)}
            style={{
                backgroundColor: modalityBgVar(key),
                color: `color-mix(in oklab, ${modalityColorVar(key)} 72%, var(--polli-color-text-strong))`,
            }}
        >
            {dot ? <ModalityDot modality={key} /> : null}
            {children}
        </Chip>
    );
}
