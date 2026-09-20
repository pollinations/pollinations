import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { ComponentPropsWithoutRef, FC, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "../lib/cn.ts";
import { ButtonDefaultsContext } from "./Button.tsx";
import { ScrollArea, type ScrollAreaProps } from "./ScrollArea.tsx";
import { headingClassName } from "./Typography.tsx";

const sizeClasses = {
    sm: "polli:max-w-md",
    md: "polli:max-w-xl",
    lg: "polli:max-w-[800px]",
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
                        "polli:fixed polli:inset-0 polli:z-[110] polli:flex polli:h-dvh polli:items-start polli:justify-center polli:overflow-hidden polli:p-0 polli:sm:p-4",
                        positionerClassName,
                    )}
                >
                    <ArkDialog.Content
                        ref={contentRef}
                        aria-label={ariaLabel}
                        aria-labelledby={labelledBy}
                        className={cn(
                            "polli:flex polli:h-dvh polli:max-h-dvh polli:w-full polli:max-sm:max-w-none polli:flex-col polli:overflow-y-auto polli:bg-theme-bg-pale polli:outline-none polli:focus:outline-none polli:focus-visible:outline-none polli:sm:my-auto polli:sm:h-auto polli:sm:max-h-[calc(100dvh-2rem)] polli:sm:rounded-2xl polli:sm:shadow-container",
                            sizeClasses[size],
                            contentClassName,
                        )}
                    >
                        {title && <DialogHeader title={title} />}
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
    inBody?: boolean;
    titleClassName?: string;
    descriptionClassName?: string;
};

export const DialogHeader: FC<DialogHeaderProps> = ({
    title,
    description,
    children,
    inBody = false,
    className,
    titleClassName,
    descriptionClassName,
    ...props
}) => {
    return (
        <div
            className={cn(
                inBody
                    ? "polli:shrink-0 polli:pt-2 polli:pb-4"
                    : "polli:shrink-0 polli:p-6 polli:pb-4",
                className,
            )}
            {...props}
        >
            {title && (
                <DialogTitle
                    className={cn(headingClassName("section"), titleClassName)}
                >
                    {title}
                </DialogTitle>
            )}
            {description && (
                <DialogDescription
                    className={cn(
                        "polli:mt-1 polli:font-body polli:text-sm polli:font-normal polli:leading-5 polli:text-theme-text-base",
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

const footerButtonDefaults = { appearance: "block" as const };

export type DialogBodyProps = ScrollAreaProps & {
    actions?: ReactNode;
    footnote?: ReactNode;
    bodyClassName?: string;
};

/** Full-height scroll area with floating actions and an optional bottom link. */
export function DialogBody({
    children,
    actions,
    footnote,
    bodyClassName,
    className,
    ...props
}: DialogBodyProps) {
    return (
        <ScrollArea
            {...props}
            className={cn(
                "polli:flex polli:min-h-0 polli:flex-1 polli:flex-col polli:overscroll-contain",
                className,
            )}
        >
            <div
                className={cn(
                    "polli:grow polli:space-y-4 polli:px-6 polli:py-4",
                    bodyClassName,
                )}
            >
                {children}
            </div>
            {(actions || footnote) && (
                <div className="polli-dialog-floating-controls polli:pointer-events-none polli:sticky polli:bottom-0 polli:z-10">
                    {actions && (
                        <DialogFooter className="polli:pointer-events-auto">
                            {actions}
                        </DialogFooter>
                    )}
                    {footnote && (
                        <div className="polli:pointer-events-auto">
                            {footnote}
                        </div>
                    )}
                </div>
            )}
        </ScrollArea>
    );
}

export const DialogFooter: FC<DialogFooterProps> = ({
    children,
    className,
    ...props
}) => {
    return (
        <div
            className={cn(
                "polli:flex polli:shrink-0 polli:flex-wrap polli:items-stretch polli:justify-center polli:gap-3 polli:bg-transparent polli:p-6 polli:pt-4 polli:sm:[&>:last-child]:grow",
                className,
            )}
            {...props}
        >
            <ButtonDefaultsContext.Provider value={footerButtonDefaults}>
                {children}
            </ButtonDefaultsContext.Provider>
        </div>
    );
};
