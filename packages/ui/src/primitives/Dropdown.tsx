import { Popover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import type { CSSProperties, FC, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../lib/cn.ts";

const DEFAULT_PANEL = "polli:rounded-lg polli:bg-theme-bg-pale polli:shadow-lg";

export type DropdownProps = {
    /** Trigger element; receives the current open state (e.g. to rotate a chevron). */
    trigger: (open: boolean) => ReactNode;
    /** Panel content. As a function, receives `close` to dismiss after a selection. */
    children: ReactNode | ((close: () => void) => ReactNode);
    /** Panel placement relative to the trigger. */
    align?: "start" | "end";
    side?: "top" | "bottom";
    /** Controlled open state. Omit to let the Dropdown manage its own. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Appended after the surface (widths, padding, max-height…). */
    className?: string;
    /** Theme variables for portaled content that cannot inherit from its trigger. */
    panelStyle?: CSSProperties;
};

export const Dropdown: FC<DropdownProps> = ({
    trigger,
    children,
    align = "start",
    side = "bottom",
    open: openProp,
    onOpenChange,
    className,
    panelStyle,
}) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : internalOpen;

    const setOpen = (next: boolean) => {
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
    };

    return (
        <Popover.Root
            open={open}
            onOpenChange={(details) => setOpen(details.open)}
            positioning={{
                placement: `${side}-${align}`,
            }}
        >
            <Popover.Trigger asChild>{trigger(open)}</Popover.Trigger>
            <Portal>
                <Popover.Positioner>
                    <Popover.Content
                        style={panelStyle}
                        className={cn(
                            "polli:z-[120] polli:overflow-hidden polli:focus:outline-none",
                            DEFAULT_PANEL,
                            className,
                        )}
                    >
                        {typeof children === "function"
                            ? children(() => setOpen(false))
                            : children}
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover.Root>
    );
};
