import { Button, Dialog } from "@pollinations/ui";
import type { FC } from "react";

type OrganizationDeleteConfirmationProps = {
    organizationName: string;
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

export const OrganizationDeleteConfirmation: FC<
    OrganizationDeleteConfirmationProps
> = ({ organizationName, open, onConfirm, onCancel }) => (
    <Dialog
        open={open}
        onOpenChange={(next) => !next && onCancel()}
        title="Delete Organization"
        size="sm"
        contentClassName="p-6"
    >
        <p className="mb-6 mt-4">
            Are you sure you want to delete <strong>{organizationName}</strong>?
            This also deletes all of its API keys and removes every member. This
            action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
            <Button type="button" onClick={onCancel}>
                Cancel
            </Button>
            <Button type="button" intent="danger" onClick={onConfirm}>
                Delete
            </Button>
        </div>
    </Dialog>
);
