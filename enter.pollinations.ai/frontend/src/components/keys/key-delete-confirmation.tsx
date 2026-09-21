import { Button } from "@pollinations/ui";
import type { FC } from "react";
import { ResourceDialog } from "../layout/resource-dialog.tsx";

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
    <ResourceDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && onCancel()}
        title="Delete API Key"
        size="sm"
        contentClassName="p-6"
    >
        <p className="mb-6 mt-4">
            Are you sure you want to delete this API key? This action cannot be
            undone.
        </p>
        <div className="flex gap-2 justify-end">
            <Button type="button" onClick={onCancel}>
                Cancel
            </Button>
            <Button type="button" intent="danger" onClick={onConfirm}>
                Delete
            </Button>
        </div>
    </ResourceDialog>
);
