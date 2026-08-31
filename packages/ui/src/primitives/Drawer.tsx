import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { FC, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "../lib/cn.ts";

export type DrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ariaLabel: string;
    children: ReactNode;
    side?: "left" | "right";
    contentClassName?: string;
};

/** Accessible side drawer for mobile navigation and compact tools. */
export const Drawer: FC<DrawerProps> = ({
    open,
    onOpenChange,
    ariaLabel,
    children,
    side = "left",
    contentClassName,
}) => {
    const contentRef = useRef<HTMLDivElement>(null);

    return (
        <ArkDialog.Root
            open={open}
            initialFocusEl={() => contentRef.current}
            onOpenChange={(details) => onOpenChange(details.open)}
        >
            <Portal>
                <ArkDialog.Backdrop className="polli:fixed polli:inset-0 polli:z-[100] polli:bg-black/40 polli:backdrop-blur-sm" />
                <ArkDialog.Positioner className="polli:pointer-events-none polli:fixed polli:inset-0 polli:z-[110] polli:h-dvh polli:overflow-hidden">
                    <ArkDialog.Content
                        ref={contentRef}
                        aria-label={ariaLabel}
                        className={cn(
                            "polli:pointer-events-auto polli:flex polli:h-dvh polli:w-[min(20rem,86vw)] polli:flex-col polli:overflow-hidden polli:border-theme-text-strong/10 polli:bg-app-bg polli:shadow-xl polli:outline-none",
                            side === "right"
                                ? "polli:ml-auto polli:border-l"
                                : "polli:border-r",
                            contentClassName,
                        )}
                    >
                        {children}
                    </ArkDialog.Content>
                </ArkDialog.Positioner>
            </Portal>
        </ArkDialog.Root>
    );
};
