import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { ComponentPropsWithoutRef, FC, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "../lib/cn.ts";

const sizeClasses = {
    sm: "polli:max-w-md",
    md: "polli:max-w-xl",
    lg: "polli:max-w-2xl",
    xl: "polli:max-w-6xl",
} as const;

export type DialogProps = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactNode;
    triggerAsChild?: boolean;
    triggerClassName?: string;
    title?: ReactNode;
    ariaLabel?: string;
    labelledBy?: string;
    size?: keyof typeof sizeClasses;
    /** Full-height form or review surface. */
    layout?: "dialog" | "flow";
    showBackdrop?: boolean;
    backdropBlur?: boolean;
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
    ariaLabel,
    labelledBy,
    size = "md",
    layout = "dialog",
    showBackdrop = true,
    backdropBlur = true,
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
                        // Scrim must DARKEN in both modes — ink-950 inverts
                        // (near-white in dark) and would brighten the page.
                        // Fixed black + a soft blur dims and de-focuses.
                        className={cn(
                            "polli:fixed polli:inset-0 polli:z-[100] polli:bg-[#000]/50",
                            backdropBlur && "polli:backdrop-blur-sm",
                        )}
                    />
                )}
                <ArkDialog.Positioner
                    className={cn(
                        "polli:fixed polli:inset-0 polli:z-[110] polli:flex polli:h-dvh polli:items-start polli:justify-center polli:overflow-hidden polli:p-4",
                        layout === "flow" && "polli:p-0 polli:sm:p-4",
                        positionerClassName,
                    )}
                >
                    <ArkDialog.Content
                        ref={contentRef}
                        aria-label={ariaLabel}
                        aria-labelledby={labelledBy}
                        className={cn(
                            "polli:my-auto polli:w-full polli:overflow-hidden polli:rounded-lg polli:border-2 polli:border-theme-border polli:bg-surface-opaque polli:shadow-lg polli:outline-none polli:focus:outline-none polli:focus-visible:outline-none",
                            sizeClasses[size],
                            layout === "flow" &&
                                "polli:flex polli:h-dvh polli:max-h-dvh polli:max-sm:max-w-none polli:flex-col polli:overflow-y-auto polli:my-0 polli:rounded-none polli:border-0 polli:shadow-none polli:sm:my-auto polli:sm:h-[calc(100dvh-2rem)] polli:sm:max-h-[calc(100dvh-2rem)] polli:sm:rounded-2xl polli:sm:shadow-container",
                            contentClassName,
                        )}
                    >
                        {title && (
                            <DialogTitle className="polli:px-6 polli:pt-6 polli:font-subheading polli:text-xl polli:text-theme-text-strong">
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
export const DialogDescription = ArkDialog.Description;

export type DialogHeaderProps = Omit<
    ComponentPropsWithoutRef<"div">,
    "title"
> & {
    title?: ReactNode;
    description?: ReactNode;
    titleClassName?: string;
    descriptionClassName?: string;
};

export const DialogHeader: FC<DialogHeaderProps> = ({
    title,
    description,
    children,
    className,
    titleClassName,
    descriptionClassName,
    ...props
}) => {
    return (
        <div
            className={cn("polli:shrink-0 polli:p-6 polli:pb-4", className)}
            {...props}
        >
            {title && (
                <DialogTitle
                    className={cn(
                        "polli:font-subheading polli:text-lg polli:font-semibold polli:text-theme-text-strong",
                        titleClassName,
                    )}
                >
                    {title}
                </DialogTitle>
            )}
            {description && (
                <DialogDescription
                    className={cn(
                        "polli:mt-1 polli:text-sm polli:text-theme-text-muted",
                        descriptionClassName,
                    )}
                >
                    {description}
                </DialogDescription>
            )}
            {children}
        </div>
    );
};

export type DialogFooterProps = ComponentPropsWithoutRef<"div">;

export const DialogFooter: FC<DialogFooterProps> = ({
    children,
    className,
    ...props
}) => {
    return (
        <div
            className={cn(
                "polli:flex polli:shrink-0 polli:items-center polli:justify-end polli:gap-2 polli:p-6 polli:pt-4",
                className,
            )}
            {...props}
        >
            {children}
        </div>
    );
};
