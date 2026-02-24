import { Dialog } from "@ark-ui/react/dialog";
import type { FC } from "react";
import { Button } from "../button.tsx";

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
    <Dialog.Root
        open={!!deleteId}
        onOpenChange={({ open }) => !open && onCancel()}
    >
        <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
        <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
            <Dialog.Content className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-md w-full p-6">
                <Dialog.Title className="text-lg font-semibold mb-4">
                    Delete API Key
                </Dialog.Title>
                <p className="mb-6">
                    Are you sure you want to delete this API key? This action
                    cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                    <Button type="button" weight="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        color="red"
                        weight="strong"
                        onClick={onConfirm}
                    >
                        Delete
                    </Button>
                </div>
            </Dialog.Content>
        </Dialog.Positioner>
    </Dialog.Root>
);
