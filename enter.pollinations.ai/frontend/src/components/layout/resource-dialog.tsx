import { cn, Dialog, type DialogProps } from "@pollinations/ui";

/** Top-aligned, scrollable shell for dashboard forms; full-screen on phones
 * unless the caller shows a compact result. */
export function ResourceDialog({
    contentClassName,
    ...props
}: Omit<DialogProps, "positionerClassName">) {
    return (
        <Dialog
            {...props}
            contentClassName={cn(
                "resource-dialog polli:sm:rounded-2xl",
                contentClassName,
            )}
        />
    );
}
