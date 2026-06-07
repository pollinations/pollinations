import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { FC, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

const sizeClasses = {
    sm: "polli:max-w-md",
    md: "polli:max-w-xl",
    lg: "polli:max-w-2xl",
} as const;

export type DialogProps = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactNode;
    triggerAsChild?: boolean;
    triggerClassName?: string;
    title?: ReactNode;
    titleClassName?: string;
    ariaLabel?: string;
    labelledBy?: string;
    theme?: ThemeName;
    size?: keyof typeof sizeClasses;
    showBackdrop?: boolean;
    backdropClassName?: string;
    positionerClassName?: string;
    contentClassName?: string;
    children: ReactNode;
};

export const Dialog: FC<DialogProps> = ({
    open,
    onOpenChange,
    trigger,
    triggerAsChild = false,
    triggerClassName,
    title,
    titleClassName,
    ariaLabel,
    labelledBy,
    theme = "neutral",
    size = "md",
    showBackdrop = true,
    backdropClassName,
    positionerClassName,
    contentClassName,
    children,
}) => {
    const contentRef = useRef<HTMLDivElement>(null);

    return (
        <ArkDialog.Root
            open={open}
            initialFocusEl={() => contentRef.current}
            onOpenChange={(details) => onOpenChange?.(details.open)}
        >
            {trigger && (
                <ArkDialog.Trigger
                    asChild={triggerAsChild}
                    className={triggerClassName}
                >
                    {trigger}
                </ArkDialog.Trigger>
            )}
            <Portal>
                {showBackdrop && (
                    <ArkDialog.Backdrop
                        className={cn(
                            "polli:fixed polli:inset-0 polli:z-[100] polli:bg-ink-950/50",
                            backdropClassName,
                        )}
                    />
                )}
                <ArkDialog.Positioner
                    data-theme={theme}
                    className={cn(
                        "polli:fixed polli:inset-0 polli:z-[110] polli:flex polli:h-dvh polli:items-start polli:justify-center polli:overflow-hidden polli:p-4",
                        positionerClassName,
                    )}
                >
                    <ArkDialog.Content
                        ref={contentRef}
                        data-theme={theme}
                        aria-label={ariaLabel}
                        aria-labelledby={labelledBy}
                        className={cn(
                            "polli:my-auto polli:w-full polli:overflow-hidden polli:rounded-lg polli:border-2 polli:border-theme-border polli:bg-surface-opaque polli:shadow-lg polli:outline-none polli:focus:outline-none polli:focus-visible:outline-none",
                            sizeClasses[size],
                            contentClassName,
                        )}
                    >
                        {title && (
                            <DialogTitle
                                className={cn(
                                    "polli:px-6 polli:pt-6 polli:font-subheading polli:text-xl polli:text-theme-text-strong",
                                    titleClassName,
                                )}
                            >
                                {title}
                            </DialogTitle>
                        )}
                        {children}
                    </ArkDialog.Content>
                </ArkDialog.Positioner>
            </Portal>
        </ArkDialog.Root>
    );
};

export const DialogTitle = ArkDialog.Title;
