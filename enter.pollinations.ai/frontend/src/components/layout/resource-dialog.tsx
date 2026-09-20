import { Dialog, type DialogProps } from "@pollinations/ui";

/** Shared shell for creating and editing dashboard resources. */
export function ResourceDialog(
    props: Omit<DialogProps, "positionerClassName" | "contentClassName">,
) {
    return (
        <Dialog
            {...props}
            positionerClassName="polli:p-4"
            contentClassName="polli:my-auto polli:h-auto polli:max-h-[calc(100dvh-2rem)] polli:overflow-hidden polli:rounded-2xl polli:bg-app-bg"
        />
    );
}
