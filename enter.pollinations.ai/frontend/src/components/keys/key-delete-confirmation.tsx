import { Button, Dialog, DialogBody, DialogFooter } from "@pollinations/ui";
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
        title="Delete API key?"
        size="sm"
    >
        <DialogBody>
            <p className="text-sm leading-relaxed">
                Apps using this key will lose access. Deleting it cannot be
                undone.
            </p>
        </DialogBody>
        <DialogFooter>
            <Button type="button" intent="neutral" onClick={onCancel}>
                Cancel
            </Button>
            <Button type="button" intent="danger" onClick={onConfirm}>
                Delete
            </Button>
        </DialogFooter>
    </Dialog>
);
