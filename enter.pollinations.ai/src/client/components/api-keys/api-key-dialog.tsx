import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useEffect, useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import type { CreateApiKey, CreateApiKeyResponse } from "./types.ts";

type ApiKeyDialogProps = {
    onSubmit: (state: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onComplete: () => void;
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onSubmit,
    onComplete,
}) => {
    // Generate a short fun default name (2 words for brevity)
    const generateFunName = () => {
        return uniqueNamesGenerator({
            dictionaries: [adjectives, animals],
            separator: "-",
            length: 2,
            style: "lowerCase",
        });
    };

    // Form state
    const [name, setName] = useState(generateFunName());
    const [description, setDescription] = useState(
        `Created on ${new Date().toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}`,
    );
    const [keyType, setKeyType] = useState<"secret" | "publishable">("secret");
    const keyPermissions = useKeyPermissions();
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
        null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const originalBodyOverflow = document.body.style.overflow;
        const originalHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = originalBodyOverflow;
            document.documentElement.style.overflow = originalHtmlOverflow;
        };
    }, [isOpen]);

    const handleKeyTypeChange = (newKeyType: "secret" | "publishable") => {
        setKeyType(newKeyType);
        setName(generateFunName());
        const dateStr = new Date().toLocaleDateString("en-US", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
        setDescription(
            newKeyType === "publishable" ? "" : `Created on ${dateStr}`,
        );
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const newKey = await onSubmit({
                name,
                description,
                keyType,
                ...keyPermissions.permissions,
            });
            setCreatedKey(newKey);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleCopyAndClose() {
        if (!createdKey) return;

        try {
            await navigator.clipboard.writeText(createdKey.key);
            setCopied(true);
            setTimeout(() => {
                onComplete();
                setIsOpen(false);
            }, 500);
        } catch (_err) {
            onComplete();
            setIsOpen(false);
        }
    }

    return (
        <Dialog.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Dialog.Trigger>
                <Button as="div" color="blue" weight="light">
                    Create new key
                </Button>
            </Dialog.Trigger>
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                <Dialog.Content className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-lg w-full max-h-[85vh] flex flex-col">
                    <div className="shrink-0 p-6 pb-4">
                        <Dialog.Title className="text-lg font-semibold">
                            Create New API Key
                        </Dialog.Title>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col flex-1 min-h-0"
                    >
                        <div
                            className="flex-1 overflow-y-auto px-6 py-2 space-y-4 scrollbar-subtle"
                            style={{
                                scrollbarWidth: "thin",
                                overscrollBehavior: "contain",
                            }}
                        >
                            <Field.Root>
                                <div className="grid grid-cols-2 gap-3">
                                    <label
                                        className={cn(
                                            "relative flex flex-col p-4 rounded-xl cursor-pointer transition-all",
                                            keyType === "publishable"
                                                ? "bg-blue-100 ring-2 ring-blue-500"
                                                : "bg-gray-50 hover:bg-gray-100",
                                            createdKey &&
                                                keyType !== "publishable" &&
                                                "opacity-40",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="keyType"
                                            value="publishable"
                                            checked={keyType === "publishable"}
                                            onChange={(e) =>
                                                handleKeyTypeChange(
                                                    e.target
                                                        .value as "publishable",
                                                )
                                            }
                                            className="sr-only"
                                            disabled={
                                                isSubmitting || !!createdKey
                                            }
                                        />
                                        <div className="font-semibold text-sm mb-2">
                                            🌐 Publishable Key
                                        </div>
                                        <ul className="text-xs text-gray-600 space-y-1 flex-1 list-disc pl-4">
                                            <li>Always visible in dashboard</li>
                                            <li>
                                                For client-side code (React,
                                                Vue)
                                            </li>
                                            <li>
                                                Rate limited: 1p/hour per IP
                                            </li>
                                        </ul>
                                        <div className="mt-3 text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded">
                                            ⚠️ Beta – still working out bugs
                                        </div>
                                    </label>
                                    <label
                                        className={cn(
                                            "relative flex flex-col p-4 rounded-xl cursor-pointer transition-all",
                                            keyType === "secret"
                                                ? "bg-purple-100 ring-2 ring-purple-500"
                                                : "bg-gray-50 hover:bg-gray-100",
                                            createdKey &&
                                                keyType !== "secret" &&
                                                "opacity-40",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="keyType"
                                            value="secret"
                                            checked={keyType === "secret"}
                                            onChange={(e) =>
                                                handleKeyTypeChange(
                                                    e.target.value as "secret",
                                                )
                                            }
                                            className="sr-only"
                                            disabled={
                                                isSubmitting || !!createdKey
                                            }
                                        />
                                        <div className="font-semibold text-sm mb-2">
                                            🔒 Secret Key
                                        </div>
                                        <ul className="text-xs text-gray-600 space-y-1 flex-1 list-disc pl-4">
                                            <li className="text-amber-700 font-medium">
                                                Only shown once – copy it!
                                            </li>
                                            <li>
                                                Never expose publicly (must be
                                                hidden in your backend)
                                            </li>
                                            <li>No rate limits</li>
                                        </ul>
                                        <div className="mt-3 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded">
                                            ✓ Recommended for production
                                        </div>
                                    </label>
                                </div>
                            </Field.Root>

                            <Field.Root className="flex items-center gap-3">
                                <Field.Label className="text-sm font-semibold shrink-0">
                                    {createdKey ? "Your API Key" : "Name"}
                                </Field.Label>
                                <Field.Input
                                    type="text"
                                    value={createdKey ? createdKey.key : name}
                                    onChange={(e) => setName(e.target.value)}
                                    className={cn(
                                        "flex-1 px-3 py-2 border rounded-lg",
                                        createdKey
                                            ? "border-green-300 bg-green-200 font-mono text-xs"
                                            : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-600",
                                    )}
                                    placeholder={
                                        createdKey ? "" : "Enter API key name"
                                    }
                                    required={!createdKey}
                                    disabled={isSubmitting || !!createdKey}
                                    readOnly={!!createdKey}
                                />
                            </Field.Root>

                            {!createdKey && (
                                <KeyPermissionsInputs
                                    value={keyPermissions}
                                    disabled={isSubmitting}
                                    inline
                                />
                            )}
                        </div>

                        <div className="flex gap-2 justify-end p-6 pt-4 shrink-0">
                            {!createdKey && (
                                <Button
                                    type="button"
                                    weight="outline"
                                    onClick={() => setIsOpen(false)}
                                    className="disabled:opacity-50"
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                            )}
                            {(() => {
                                const { allowedModels } =
                                    keyPermissions.permissions;
                                const noModelsSelected =
                                    Array.isArray(allowedModels) &&
                                    allowedModels.length === 0;
                                const isDisabled =
                                    !createdKey &&
                                    (!name.trim() ||
                                        isSubmitting ||
                                        noModelsSelected);

                                const buttonText = () => {
                                    if (copied) return "✓ Copied! Closing...";
                                    if (createdKey) return "Copy and Close";
                                    if (isSubmitting) return "Creating...";
                                    return "Create";
                                };

                                return (
                                    <span
                                        title={
                                            noModelsSelected && !createdKey
                                                ? "Select at least one model"
                                                : undefined
                                        }
                                    >
                                        <Button
                                            type={
                                                createdKey ? "button" : "submit"
                                            }
                                            onClick={
                                                createdKey
                                                    ? handleCopyAndClose
                                                    : undefined
                                            }
                                            className="disabled:opacity-50"
                                            disabled={isDisabled}
                                        >
                                            {buttonText()}
                                        </Button>
                                    </span>
                                );
                            })()}
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
