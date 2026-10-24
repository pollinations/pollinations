import { cn, Dialog, type DialogProps } from "@pollinations/ui";

/** Keep expandable forms top-aligned. */
export function ResourceDialog({
    contentClassName,
    ...props
}: Omit<DialogProps, "positionerClassName">) {
    return (
        <Dialog
            {...props}
            contentClassName={cn("resource-dialog", contentClassName)}
        />
    );
}
