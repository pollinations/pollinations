import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { TabButton } from "../../primitives/TabButton.tsx";

type ModalityTabOwnProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
    disabled?: boolean;
    className?: string;
};

/**
 * A model-filter tab. Monochrome and borderless — it renders the app's `soft`
 * TabButton, so it uses exactly the same tokens as the dashboard tabs: selected
 * is `bg-active` (the resting button fill, no hover), idle is the quiet
 * `bg-subtle`, and hover darkens to `bg-hover` like any button.
 *
 * Rest props (including a runtime-injected ref) pass through to the button —
 * required when the tab is a popover trigger, where the positioner's anchor
 * ref arrives via asChild and a closed prop set would silently drop it.
 */
export function ModalityTab({
    active,
    onClick,
    children,
    size = "md",
    disabled = false,
    className,
    ...rest
}: ModalityTabOwnProps &
    Omit<ComponentPropsWithoutRef<"button">, keyof ModalityTabOwnProps>) {
    return (
        <TabButton
            {...rest}
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
