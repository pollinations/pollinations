import { type ReactNode, useEffect, useState } from "react";
import { AuthActionButtons, ErrorBanner } from "../modules/auth/AuthModal.tsx";
import { Button } from "../primitives/Button.tsx";
import { Dialog, DialogTitle } from "../primitives/Dialog.tsx";
import { ScrollArea } from "../primitives/ScrollArea.tsx";
import { Heading } from "../primitives/Typography.tsx";

export type ConfirmationDialogProps = {
    open: boolean;
    title: ReactNode;
    children: ReactNode;
    confirmLabel: string;
    pendingLabel: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
};

export function ConfirmationDialog({
    open,
    title,
    children,
    confirmLabel,
    pendingLabel,
    destructive = false,
    onConfirm,
    onCancel,
}: ConfirmationDialogProps) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) setError(null);
    }, [open]);

    function cancel() {
        if (!pending) onCancel();
    }

    async function confirm() {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            await onConfirm();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Couldn’t complete this action. Try again.",
            );
        } finally {
            setPending(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => !nextOpen && cancel()}
            closeOnInteractOutside={!pending}
            size="sm"
            contentClassName="polli:flex polli:max-h-[calc(100dvh-2rem)] polli:flex-col polli:rounded-2xl polli:border-0 polli:bg-surface-white"
        >
            <Heading
                as={DialogTitle}
                size="section"
                className="polli:shrink-0 polli:px-6 polli:pt-6"
            >
                {title}
            </Heading>
            <ScrollArea className="polli:min-h-0 polli:flex-1 polli:overscroll-contain polli:px-6 polli:pt-4 polli:pb-2">
                <div className="polli:space-y-4 polli:text-sm">
                    {children}
                    {error && <ErrorBanner>{error}</ErrorBanner>}
                </div>
            </ScrollArea>
            <div className="polli:shrink-0 polli:p-6 polli:pt-4">
                <AuthActionButtons
                    secondaryAction={
                        <Button
                            type="button"
                            data-theme="neutral"
                            onClick={cancel}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                    }
                    actions={
                        <Button
                            type="button"
                            intent={destructive ? "danger" : undefined}
                            onClick={() => void confirm()}
                            disabled={pending}
                            aria-busy={pending}
                        >
                            {pending ? pendingLabel : confirmLabel}
                        </Button>
                    }
                />
            </div>
        </Dialog>
    );
}
