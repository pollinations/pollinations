import { Dialog } from "@ark-ui/react/dialog";
import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { useScrollLock } from "../../hooks/use-scroll-lock.ts";
import { Button } from "../button.tsx";
import type { ApiKey } from "./types.ts";

interface RotateKeyDialogProps {
    apiKey: ApiKey | null;
    onRotate: (id: string) => Promise<{ key: string; warning?: string }>;
    onClose: () => void;
}

export const RotateKeyDialog: FC<RotateKeyDialogProps> = ({
    apiKey,
    onRotate,
    onClose,
}) => {
    const [isRotating, setIsRotating] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    const isOpen = !!apiKey;
    const isSecret = apiKey?.metadata?.keyType !== "publishable";
    useScrollLock(isOpen);

    function handleClose() {
        setNewKey(null);
        setCopied(false);
        setError(null);
        setWarning(null);
        setIsRotating(false);
        onClose();
    }

    async function handleRotate() {
        if (!apiKey) return;
        setIsRotating(true);
        setError(null);
        try {
            const result = await onRotate(apiKey.id);
            setNewKey(result.key);
            if (result.warning) {
                setWarning(result.warning);
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to rotate key",
            );
        } finally {
            setIsRotating(false);
        }
    }

    async function handleCopyAndClose() {
        if (!newKey) return;
        try {
            await navigator.clipboard.writeText(newKey);
            setCopied(true);
            setTimeout(handleClose, 500);
        } catch {
            setError(
                "Could not copy to clipboard. Please select and copy the key manually.",
            );
        }
    }

    function getButtonText(): string {
        if (copied) return "Copied! Closing...";
        if (newKey) return "Copy and Close";
        if (isRotating) return "Rotating...";
        return "Rotate";
    }

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={({ open }) => !open && handleClose()}
        >
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                <Dialog.Content
                    className={cn(
                        "border-4 rounded-lg shadow-lg max-w-lg w-full flex flex-col",
                        "bg-green-100 border-green-950",
                    )}
                >
                    <div className="p-6 pb-4">
                        <Dialog.Title className="text-lg font-semibold">
                            Rotate API Key
                        </Dialog.Title>
                        {newKey ? (
                            <div className="text-sm mt-1 space-y-1">
                                <p className="text-gray-500">
                                    ✅ Your new key has been generated.
                                </p>
                                {isSecret && (
                                    <p className="text-amber-700 font-medium">
                                        ⚠️ Copy it now — you won't be able to see
                                        it again!
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="text-sm mt-1 space-y-1">
                                <p className="text-gray-500">
                                    🔄 This will generate a new key and
                                    invalidate the current one.
                                </p>
                                <p className="text-red-600 font-medium">
                                    ⚠️ Any applications using the old key will
                                    stop working.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-2 space-y-4">
                        {warning && (
                            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                                ⚠️ {warning}
                            </p>
                        )}
                        {error && (
                            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                {error}
                            </p>
                        )}

                        {newKey ? (
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold shrink-0">
                                    Your API Key
                                </span>
                                <input
                                    type="text"
                                    value={newKey}
                                    readOnly
                                    className="flex-1 px-3 py-2 border rounded-lg border-green-300 bg-green-200 font-mono text-xs"
                                />
                            </div>
                        ) : (
                            apiKey && (
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold shrink-0">
                                        Key
                                    </span>
                                    <span className="font-mono text-xs text-gray-500">
                                        {apiKey.name} ({apiKey.start}...)
                                    </span>
                                </div>
                            )
                        )}
                    </div>

                    <div className="flex gap-2 justify-end p-6 pt-4">
                        {!newKey && (
                            <Button
                                type="button"
                                weight="outline"
                                onClick={handleClose}
                                disabled={isRotating}
                            >
                                Cancel
                            </Button>
                        )}
                        <Button
                            type="button"
                            color={newKey ? "green" : "red"}
                            weight="strong"
                            onClick={newKey ? handleCopyAndClose : handleRotate}
                            disabled={isRotating}
                        >
                            {getButtonText()}
                        </Button>
                    </div>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
