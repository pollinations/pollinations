import { ConfirmationDialog } from "@pollinations/ui";
import type { FC } from "react";

interface DeleteConfirmationProps {
    deleteId: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirmation: FC<DeleteConfirmationProps> = ({
    deleteId,
    onConfirm,
    onCancel,
}) => (
    <ConfirmationDialog
        open={!!deleteId}
        title="Delete key?"
        description="Apps using this key will lose access. Deleting it cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
    />
);
