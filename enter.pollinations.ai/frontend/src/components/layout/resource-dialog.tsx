import { cn, Dialog, type DialogProps } from "@pollinations/ui";

/** Keep expandable forms top-aligned; compact results stay centered. */
export function ResourceDialog({
    contentClassName,
    fullscreenOnMobile = true,
    ...props
}: Omit<DialogProps, "positionerClassName">) {
    return (
        <Dialog
            {...props}
            fullscreenOnMobile={fullscreenOnMobile}
            contentClassName={cn(
                fullscreenOnMobile && "resource-dialog",
                contentClassName,
            )}
        />
    );
}
