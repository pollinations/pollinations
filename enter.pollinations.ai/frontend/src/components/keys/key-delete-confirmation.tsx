import { Button, Dialog } from "@pollinations/ui";
import type { FC } from "react";

interface DeleteConfirmationProps {
    deleteId: string | null;
    onConfirm: () => void;
    onCancel: () => void;
    title?: string;
    message?: string;
    confirmLabel?: string;
}

export const DeleteConfirmation: FC<DeleteConfirmationProps> = ({
    deleteId,
    onConfirm,
    onCancel,
    title = "Delete API Key",
    message = "Are you sure you want to delete this API key? This action cannot be undone.",
    confirmLabel = "Delete",
}) => (
    <Dialog
        open={!!deleteId}
        onOpenChange={(open) => !open && onCancel()}
        title={title}
        size="sm"
        contentClassName="p-6"
    >
        <p className="mb-6 mt-4">{message}</p>
        <div className="flex gap-2 justify-end">
            <Button type="button" onClick={onCancel}>
                Cancel
            </Button>
            <Button type="button" intent="danger" onClick={onConfirm}>
                {confirmLabel}
            </Button>
        </div>
    </Dialog>
);
