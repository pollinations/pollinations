import { ConfirmationDialog } from "@pollinations/ui";
import type { FC } from "react";

interface DeleteConfirmationProps {
    app: boolean | null;
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirmation: FC<DeleteConfirmationProps> = ({
    app,
    onConfirm,
    onCancel,
}) => (
    <ConfirmationDialog
        open={app !== null}
        title={app ? "Delete app key?" : "Delete secret key?"}
        description={
            app
                ? "New users will no longer be able to connect with this app key. Existing connections will remain active. Deleting it cannot be undone."
                : "Requests using this secret key will stop working. Deleting it cannot be undone."
        }
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
    />
);
