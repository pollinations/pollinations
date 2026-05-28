import { Dialog } from "@ark-ui/react/dialog";
import type { FC } from "react";
import { Button } from "../ui/button.tsx";

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
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-gray-950/50" />
        <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
            <Dialog.Content
                data-theme="blue"
                className="w-full max-w-md rounded-lg border-2 border-blue-300 bg-white p-6 shadow-lg"
            >
                <Dialog.Title className="text-lg font-semibold mb-4">
                    Delete API Key
                </Dialog.Title>
                <p className="mb-6">
                    Are you sure you want to delete this API key? This action
                    cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                    <Button type="button" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="button" intent="danger" onClick={onConfirm}>
                        Delete
                    </Button>
                </div>
            </Dialog.Content>
        </Dialog.Positioner>
    </Dialog.Root>
);
