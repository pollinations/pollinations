import { Button, Dialog, DialogFooter } from "@pollinations/ui";
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
    <Dialog
        open={!!deleteId}
        onOpenChange={(open) => !open && onCancel()}
        title="Delete API Key"
        size="sm"
    >
        <p className="flex-1 px-6 py-4">
            Are you sure you want to delete this API key? This action cannot be
            undone.
        </p>
        <DialogFooter>
            <Button type="button" onClick={onCancel}>
                Cancel
            </Button>
            <Button type="button" intent="danger" onClick={onConfirm}>
                Delete
            </Button>
        </DialogFooter>
    </Dialog>
);
