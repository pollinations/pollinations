import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
import { cn } from "@/util.ts";
import { useAutoHideScrollbar } from "../../hooks/use-auto-hide-scrollbar.ts";
import { useScrollLock } from "../../hooks/use-scroll-lock.ts";
import { Button } from "../button.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import type { PermissionUiTheme } from "./permission-ui.ts";
import { PublishableKeySettings } from "./publishable-key-settings.tsx";
import type { CreateApiKey, CreateApiKeyResponse } from "./types.ts";

type ApiKeyDialogProps = {
    onSubmit: (state: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onComplete: () => void;
    triggerLabel?: string;
    triggerColor?: "blue" | "green" | "purple" | "amber";
    /** Simplified mode: hides key type selector, permissions, budget, expiry. Shows only name + URL. */
    simplified?: boolean;
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onSubmit,
    onComplete,
    triggerLabel = "Create new key",
    triggerColor = "blue",
    simplified = false,
}) => {
    function generateFunName(): string {
        return uniqueNamesGenerator({
            dictionaries: [adjectives, animals],
            separator: "-",
            length: 2,
            style: "lowerCase",
        });
    }

    const [name, setName] = useState(generateFunName());
    const [description, setDescription] = useState(
        `Created on ${new Date().toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}`,
    );
    const [keyType, setKeyType] = useState<"secret" | "publishable">(
        simplified ? "publishable" : "secret",
    );
    const [appUrl, setAppUrl] = useState("");
    const keyPermissions = useKeyPermissions(
        simplified
            ? {
                  pollenBudget: 0,
                  expiryDays: null,
                  allowedModels: [],
                  accountPermissions: [],
              }
            : {},
    );
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
        null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollAreaRef = useAutoHideScrollbar<HTMLDivElement>(isOpen);

    useScrollLock(isOpen);

    function handleKeyTypeChange(newKeyType: "secret" | "publishable"): void {
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
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            const isPublishable = keyType === "publishable";
            const newKey = await onSubmit({
                name,
                description,
                keyType,
                ...keyPermissions.permissions,
                ...(isPublishable && appUrl && { appUrl }),
            });
            setCreatedKey(newKey);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to create key",
            );
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
        } catch {
            onComplete();
            setIsOpen(false);
        }
    }

    const { allowedModels } = keyPermissions.permissions;
    const noModelsSelected =
        !simplified &&
        Array.isArray(allowedModels) &&
        allowedModels.length === 0;
    const isCreateDisabled =
        !createdKey && (!name.trim() || isSubmitting || noModelsSelected);
    const keyTypeTheme: PermissionUiTheme =
        keyType === "publishable" ? "blue" : "violet";
    const keyTypeStyles =
        keyType === "publishable"
            ? {
                  panelClasses: "bg-white border-blue-300 scrollbar-theme-blue",
                  editableInputClasses:
                      "border-blue-300 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500/60",
                  readOnlyInputClasses: "border-blue-300 bg-blue-100",
                  selectedKeyCardClasses: "bg-blue-100 ring-2 ring-blue-300",
              }
            : {
                  panelClasses:
                      "bg-white border-violet-300 scrollbar-theme-violet",
                  editableInputClasses:
                      "border-violet-300 focus:outline-none focus-visible:border-violet-500 focus-visible:ring-1 focus-visible:ring-violet-500/60",
                  readOnlyInputClasses: "border-violet-300 bg-violet-100",
                  selectedKeyCardClasses:
                      "bg-violet-100 ring-2 ring-violet-300",
              };

    function getButtonText(): string {
        if (copied) return "Copied! Closing...";
        if (createdKey) return "Copy and Close";
        if (isSubmitting) return "Creating...";
        return "Create";
    }

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={({ open }) => {
                if (open) {
                    setCreatedKey(null);
                    setCopied(false);
                    setError(null);
                    setName(generateFunName());
                    setAppUrl("");
                    setKeyType(simplified ? "publishable" : "secret");
                    const dateStr = new Date().toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                    });
                    setDescription(simplified ? "" : `Created on ${dateStr}`);
                }
                setIsOpen(open);
            }}
        >
            <Dialog.Trigger>
                <Button as="div" color={triggerColor} weight="light">
                    {triggerLabel}
                </Button>
            </Dialog.Trigger>
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                <Dialog.Content
                    className={cn(
                        "border-4 rounded-lg shadow-lg max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden",
                        "bg-white border-green-950",
                    )}
                >
                    <div className="shrink-0 p-6 pb-4">
                        <Dialog.Title className="text-lg font-semibold">
                            {simplified ? "Create App Key" : "Create API Key"}
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 mt-1">
                            {simplified ? (
                                <>
                                    🪷 Register your app for{" "}
                                    <a
                                        href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-green-700 underline hover:text-green-900"
                                    >
                                        BYOP
                                    </a>
                                    <br />🪷 Let your users connect and use
                                    their own pollen in your app.
                                </>
                            ) : (
                                "Access AI models for text, image, and audio generation."
                            )}
                        </p>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col flex-1 min-h-0 overflow-hidden"
                    >
                        <div className="px-6 pt-2 pb-4 space-y-4 shrink-0">
                            {error && (
                                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                    {error}
                                </p>
                            )}

                            {!simplified && (
                                <Field.Root>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label
                                            className={cn(
                                                "relative flex flex-col p-4 rounded-lg cursor-pointer transition-all",
                                                keyType === "publishable"
                                                    ? keyTypeStyles.selectedKeyCardClasses
                                                    : "bg-white hover:bg-gray-50",
                                                createdKey &&
                                                    keyType !== "publishable" &&
                                                    "opacity-40",
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="keyType"
                                                value="publishable"
                                                checked={
                                                    keyType === "publishable"
                                                }
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
                                                <li>
                                                    Always visible in dashboard
                                                </li>
                                                <li>
                                                    For client-side code (React,
                                                    Vue)
                                                </li>
                                                <li>
                                                    Rate limited: 1p/hour per IP
                                                </li>
                                            </ul>
                                            <div className="mt-3 text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded">
                                                ⚠️ Beta – not safe for production
                                            </div>
                                        </label>
                                        <label
                                            className={cn(
                                                "relative flex flex-col p-4 rounded-lg cursor-pointer transition-all",
                                                keyType === "secret"
                                                    ? keyTypeStyles.selectedKeyCardClasses
                                                    : "bg-white hover:bg-gray-50",
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
                                                        e.target
                                                            .value as "secret",
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
                                                    Never expose publicly (must
                                                    be hidden in your backend)
                                                </li>
                                                <li>No rate limits</li>
                                            </ul>
                                            <div className="mt-3 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded">
                                                ✓ Recommended for production
                                            </div>
                                        </label>
                                    </div>
                                </Field.Root>
                            )}
                        </div>

                        <div className="px-6 pb-2 flex flex-1 min-h-0 overflow-hidden">
                            <div
                                ref={scrollAreaRef}
                                className={cn(
                                    "border-2 rounded-lg flex-1 min-h-0 overflow-y-auto scrollbar-subtle",
                                    keyTypeStyles.panelClasses,
                                )}
                                style={{
                                    overscrollBehavior: "contain",
                                }}
                            >
                                <div className="p-4 space-y-4">
                                    <Field.Root className="flex items-center gap-3">
                                        <Field.Label className="text-sm font-semibold shrink-0">
                                            {createdKey
                                                ? simplified
                                                    ? "Your App Key"
                                                    : "Your API Key"
                                                : "Name"}
                                        </Field.Label>
                                        <Field.Input
                                            type="text"
                                            value={
                                                createdKey
                                                    ? createdKey.key
                                                    : name
                                            }
                                            onChange={(e) =>
                                                setName(e.target.value)
                                            }
                                            className={cn(
                                                "flex-1 px-3 py-2 border rounded-lg",
                                                createdKey
                                                    ? `${keyTypeStyles.readOnlyInputClasses} font-mono text-xs`
                                                    : keyTypeStyles.editableInputClasses,
                                            )}
                                            placeholder={
                                                createdKey
                                                    ? ""
                                                    : "Enter API key name"
                                            }
                                            required={!createdKey}
                                            disabled={
                                                isSubmitting || !!createdKey
                                            }
                                            readOnly={!!createdKey}
                                        />
                                    </Field.Root>

                                    {simplified && !createdKey && (
                                        <PublishableKeySettings
                                            appUrl={appUrl}
                                            onAppUrlChange={setAppUrl}
                                            disabled={isSubmitting}
                                        />
                                    )}

                                    {!simplified && !createdKey && (
                                        <KeyPermissionsInputs
                                            value={keyPermissions}
                                            disabled={isSubmitting}
                                            inline
                                            theme={keyTypeTheme}
                                        />
                                    )}
                                </div>
                            </div>
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
                            <span
                                title={
                                    noModelsSelected && !createdKey
                                        ? "Select at least one model"
                                        : undefined
                                }
                            >
                                <Button
                                    type={createdKey ? "button" : "submit"}
                                    onClick={
                                        createdKey
                                            ? handleCopyAndClose
                                            : undefined
                                    }
                                    className="disabled:opacity-50"
                                    disabled={isCreateDisabled}
                                >
                                    {getButtonText()}
                                </Button>
                            </span>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
