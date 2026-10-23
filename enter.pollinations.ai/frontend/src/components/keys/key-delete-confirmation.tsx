import { Alert, ConfirmationDialog } from "@pollinations/ui";
import type { FC } from "react";

interface DeleteConfirmationProps {
    app: boolean | null;
    error: string | null;
    pending: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirmation: FC<DeleteConfirmationProps> = ({
    app,
    error,
    pending,
    onConfirm,
    onCancel,
}) => (
    <ConfirmationDialog
        open={app !== null}
        title={app ? "Delete app key?" : "Delete secret key?"}
        description={
            app
                ? "Existing connections keep working, but you stop earning from them. Users won’t be able to connect or authorize again with this app key. Deleting it cannot be undone."
                : "Requests using this secret key will stop working. Deleting it cannot be undone."
        }
        confirmLabel={pending ? "Deleting…" : "Delete"}
        confirmDisabled={pending}
        cancelDisabled={pending}
        onConfirm={onConfirm}
        onCancel={onCancel}
    >
        {error && <Alert intent="danger">{error}</Alert>}
    </ConfirmationDialog>
);
