import {
    Alert,
    ConfirmationDialog,
    Dialog,
    RefreshIcon,
} from "@pollinations/ui";
import type { FC } from "react";
import { CreatedKeyContent } from "./key-dialog-content.tsx";

interface RotateKeyDialogProps {
    open: boolean;
    /** The new secret, once rotation succeeded. */
    secret: string | null;
    error: string | null;
    pending: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

/** Confirms the rotation, then shows the new secret once, as key creation does. */
export const RotateKeyDialog: FC<RotateKeyDialogProps> = ({
    open,
    secret,
    error,
    pending,
    onConfirm,
    onClose,
}) =>
    secret === null ? (
        <ConfirmationDialog
            open={open}
            title="Rotate secret key?"
            description="You get a new secret with the same name, model access, budget, permissions and expiry. The current secret stops working immediately, so update every app and script that uses it."
            confirmLabel={pending ? "Rotating…" : "Rotate"}
            confirmIcon={
                <RefreshIcon
                    className={
                        pending
                            ? "animate-spin motion-reduce:animate-none"
                            : undefined
                    }
                />
            }
            confirmDisabled={pending}
            cancelDisabled={pending}
            onConfirm={onConfirm}
            onCancel={onClose}
        >
            {error && <Alert intent="danger">{error}</Alert>}
        </ConfirmationDialog>
    ) : (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <CreatedKeyContent
                title="Secret key rotated"
                description="Copy your new secret key now. You won’t be able to see it again. The previous secret no longer works."
                value={secret}
                onClose={onClose}
            />
        </Dialog>
    );
