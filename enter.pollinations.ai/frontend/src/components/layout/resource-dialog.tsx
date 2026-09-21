import { cn, Dialog, type DialogProps } from "@pollinations/ui";

/** Contained, scrollable shell for dashboard forms and confirmations. */
export function ResourceDialog({
    contentClassName,
    ...props
}: Omit<DialogProps, "positionerClassName">) {
    return (
        <Dialog
            {...props}
            positionerClassName="polli:p-4"
            contentClassName={cn(
                "polli:my-auto polli:h-auto polli:max-h-[calc(100dvh-2rem)] polli:rounded-2xl",
                contentClassName,
            )}
        />
    );
}
