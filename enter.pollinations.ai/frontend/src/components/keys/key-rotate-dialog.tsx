import {
    Alert,
    Button,
    CheckIcon,
    ClipboardIcon,
    ConfirmationDialog,
    CopyButton,
    CopyField,
    Dialog,
    DialogBody,
    DialogHeader,
    FieldStack,
    RefreshIcon,
    XIcon,
} from "@pollinations/ui";
import type { FC } from "react";

interface RotateKeyDialogProps {
    open: boolean;
    /** The new secret, once rotation succeeded. */
    secret: string | null;
    error: string | null;
    pending: boolean;
    onConfirm: () => void;
    onClose: () => void;
    onCopyError: () => void;
}

/** Warns that rotation invalidates the old secret, then shows the new one once. */
export const RotateKeyDialog: FC<RotateKeyDialogProps> = ({
    open,
    secret,
    error,
    pending,
    onConfirm,
    onClose,
    onCopyError,
}) => {
    if (secret === null) {
        return (
            <ConfirmationDialog
                open={open}
                title="Rotate secret key?"
                description="You get a new secret with the same name, model access, budget, permissions and expiry. The current secret stops working immediately, so update every app and script that uses it."
                confirmLabel={pending ? "Rotating…" : "Rotate"}
                confirmIcon={<RefreshIcon />}
                confirmDisabled={pending}
                cancelDisabled={pending}
                onConfirm={onConfirm}
                onCancel={onClose}
            >
                {error && <Alert intent="danger">{error}</Alert>}
            </ConfirmationDialog>
        );
    }

    const actions = (
        <>
            <Button
                type="button"
                intent="neutral"
                icon={<XIcon />}
                onClick={onClose}
            >
                Close
            </Button>
            <CopyButton
                value={secret}
                variant="button"
                copiedTimeoutMs={500}
                tooltip={null}
                onCopied={() => setTimeout(onClose, 500)}
                onCopyError={onCopyError}
            >
                {(copied) => (
                    <span className="inline-flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="flex size-4 shrink-0 [&>svg]:size-full"
                        >
                            {copied ? <CheckIcon /> : <ClipboardIcon />}
                        </span>
                        {copied ? "Copied" : "Copy and close"}
                    </span>
                )}
            </CopyButton>
        </>
    );

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogBody actions={actions}>
                <DialogHeader
                    inBody
                    title="Secret key rotated"
                    description="Copy your new secret key now. You won’t be able to see it again. The previous secret no longer works."
                />
                {error && <Alert intent="danger">{error}</Alert>}
                <FieldStack label="New secret key">
                    <CopyField value={secret} label="Copy secret key" />
                </FieldStack>
            </DialogBody>
        </Dialog>
    );
};
