import type { ReactNode } from "react";
import { TabButton } from "../../primitives/TabButton.tsx";

/**
 * A model-filter tab. Monochrome and borderless — it renders the app's `soft`
 * TabButton, so it uses exactly the same tokens as the dashboard tabs: selected
 * is `bg-active` (the resting button fill, no hover), idle is the quiet
 * `bg-subtle`, and hover darkens to `bg-hover` like any button. Modality is no
 * longer color-coded on tabs; `modality`/`bordered` are accepted only for
 * backward compatibility and have no visual effect.
 */
export function ModalityTab({
    active,
    onClick,
    children,
    size = "md",
    disabled = false,
    className,
}: {
    /** Accepted for compatibility; tabs are monochrome (no per-modality color). */
    modality?: string;
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
    /** Deprecated — tabs are always borderless now. */
    bordered?: boolean;
    disabled?: boolean;
    className?: string;
}) {
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
