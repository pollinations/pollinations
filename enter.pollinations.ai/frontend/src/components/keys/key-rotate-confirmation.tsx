import { Button, Dialog } from "@pollinations/ui";
import type { FC } from "react";

interface RotateConfirmationProps {
    rotateId: string | null;
    onConfirm: () => void;
    onCancel: () => void;
    pending?: boolean;
}

export const RotateConfirmation: FC<RotateConfirmationProps> = ({
    rotateId,
    onConfirm,
    onCancel,
    pending = false,
}) => (
    <Dialog
        open={!!rotateId}
        onOpenChange={(open) => !open && !pending && onCancel()}
        title="Rotate API Key"
        size="sm"
        contentClassName="p-6"
    >
        <p className="mb-6 mt-4">
            This creates a replacement key with the same permissions, allowed
            models, Pollen budget, and expiry, then{" "}
            <strong className="font-semibold text-theme-text-strong">
                permanently invalidates
            </strong>{" "}
            the current key. Copy the new secret when it appears — it is shown
            only once.
        </p>
        <div className="flex gap-2 justify-end">
            <Button type="button" onClick={onCancel} disabled={pending}>
                Cancel
            </Button>
            <Button
                type="button"
                intent="danger"
                onClick={onConfirm}
                disabled={pending}
            >
                {pending ? "Rotating…" : "Rotate key"}
            </Button>
        </div>
    </Dialog>
);
