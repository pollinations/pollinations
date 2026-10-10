import type { ModelCategory } from "@pollinations/sdk";
import type {
    ComponentPropsWithoutRef,
    ComponentType,
    CSSProperties,
    ReactNode,
} from "react";
import { cn } from "../../lib/cn.ts";
import type { IconProps } from "../../primitives/icons/types.ts";
import { TabButton } from "../../primitives/TabButton.tsx";
import { modalityTextColor } from "./themes.ts";

type ModalityTabOwnProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    className?: string;
    /** Leading icon, drawn before the label. */
    icon?: ComponentType<IconProps>;
    /** Tints the icon of an idle, unhovered tab in this modality's colour. */
    modality?: ModelCategory;
};

/**
 * A model-filter tab. Borderless — it renders the app's `soft` TabButton, so
 * it uses exactly the same tokens as the dashboard tabs: selected is
 * `bg-active` (the resting button fill, no hover), idle is the quiet
 * `bg-subtle`, and hover darkens to `bg-hover` like any button. With
 * `modality`, only an idle tab's icon carries the modality colour; selection
 * and hover stay monochrome, so amber remains the only selection signal.
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
    icon: Icon,
    modality,
    ...rest
}: ModalityTabOwnProps &
    Omit<ComponentPropsWithoutRef<"button">, keyof ModalityTabOwnProps>) {
    const tint = modality && !active ? modalityTextColor(modality) : undefined;

    return (
        <TabButton
            {...rest}
            active={active}
            onClick={onClick}
            size={size}
            disabled={disabled}
            className={cn(Icon && "polli:group polli:gap-2", className)}
        >
            {Icon ? (
                <Icon
                    aria-hidden="true"
                    className={cn(
                        "polli:size-4 polli:shrink-0",
                        tint &&
                            "polli:text-(--polli-tab-icon) polli:group-hover:text-current",
                    )}
                    style={
                        tint
                            ? ({ "--polli-tab-icon": tint } as CSSProperties)
                            : undefined
                    }
                />
            ) : null}
            {children}
        </TabButton>
    );
}
