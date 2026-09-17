import type { ReactNode } from "react";
import { Button } from "../primitives/Button.tsx";
import { Dialog, DialogBody, DialogFooter } from "../primitives/Dialog.tsx";
import { CheckIcon, TrashIcon, XIcon } from "../primitives/icons/index.tsx";

type ConfirmIntent = "danger" | "info" | "neutral";

const defaultIcons: Record<ConfirmIntent, ReactNode> = {
    danger: <TrashIcon />,
    info: <CheckIcon />,
    neutral: <CheckIcon />,
};

export type ConfirmationDialogProps = {
    open: boolean;
    title: ReactNode;
    /** Short explanation rendered as body text. */
    description?: ReactNode;
    /** Extra body content below the description (alerts, inputs). */
    children?: ReactNode;
    confirmLabel: ReactNode;
    /** Confirm button recipe; also picks the default confirm icon. */
    intent?: ConfirmIntent;
    /** Override the confirm icon when the action is not a plain delete/confirm. */
    confirmIcon?: ReactNode;
    confirmDisabled?: boolean;
    cancelDisabled?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

/** One Cancel + action footer for every yes/no dialog. */
export function ConfirmationDialog({
    open,
    title,
    description,
    children,
    confirmLabel,
    intent = "danger",
    confirmIcon,
    confirmDisabled = false,
    cancelDisabled = false,
    onConfirm,
    onCancel,
}: ConfirmationDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !next && onCancel()}
            title={title}
        >
            <DialogBody>
                {description && (
                    <p className="polli:text-sm polli:leading-relaxed">
                        {description}
                    </p>
                )}
                {children}
            </DialogBody>
            <DialogFooter>
                <Button
                    type="button"
                    intent="neutral"
                    icon={<XIcon />}
                    onClick={onCancel}
                    disabled={cancelDisabled}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    intent={intent}
                    icon={confirmIcon ?? defaultIcons[intent]}
                    onClick={onConfirm}
                    disabled={confirmDisabled}
                >
                    {confirmLabel}
                </Button>
            </DialogFooter>
        </Dialog>
    );
}
