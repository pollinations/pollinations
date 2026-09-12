import { ConfirmationDialog } from "@pollinations/ui";
import type { FC } from "react";

interface DeleteConfirmationProps {
    deleteId: string | null;
    kind?: "keys" | "apps";
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

export const DeleteConfirmation: FC<DeleteConfirmationProps> = ({
    deleteId,
    kind = "keys",
    onConfirm,
    onCancel,
}) => {
    return (
        <ConfirmationDialog
            open={!!deleteId}
            title={kind === "apps" ? "Delete App" : "Delete API Key"}
            confirmLabel="Delete"
            pendingLabel="Deleting…"
            destructive
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            <p>
                Are you sure you want to delete this{" "}
                {kind === "apps" ? "app" : "API key"}? This action cannot be
                undone.
            </p>
        </ConfirmationDialog>
    );
};
