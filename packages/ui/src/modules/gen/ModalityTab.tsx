import type { ReactNode } from "react";
import { TabButton } from "../../primitives/TabButton.tsx";

/**
 * A model-filter tab. Monochrome and borderless — it renders the app's `soft`
 * TabButton, so it uses exactly the same tokens as the dashboard tabs: selected
 * is `bg-active` (the resting button fill, no hover), idle is the quiet
 * `bg-subtle`, and hover darkens to `bg-hover` like any button.
 */
export function ModalityTab({
    active,
    onClick,
    children,
    size = "md",
    disabled = false,
    className,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
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
