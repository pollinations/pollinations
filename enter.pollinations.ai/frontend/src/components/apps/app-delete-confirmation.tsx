import { Button, Dialog } from "@pollinations/ui";
import type { UserApp } from "./types.ts";

type AppDeleteConfirmationProps = {
    app: UserApp | null;
    onConfirm: () => void;
    onCancel: () => void;
};

export function AppDeleteConfirmation({
    app,
    onConfirm,
    onCancel,
}: AppDeleteConfirmationProps) {
    return (
        <Dialog
            open={!!app}
            onOpenChange={(open) => !open && onCancel()}
            title="Delete App"
            size="sm"
            contentClassName="p-6"
        >
            <p className="mb-6 mt-4">
                Delete <span className="font-mono text-sm">{app?.slug}</span>?
                This removes the app, releases its subdomain, and cannot be
                undone.
            </p>
            <div className="flex justify-end gap-2">
                <Button type="button" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" intent="danger" onClick={onConfirm}>
                    Delete
                </Button>
            </div>
        </Dialog>
    );
}
