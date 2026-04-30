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
import { Button } from "../button.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import { PublishableKeySettings } from "./publishable-key-settings.tsx";
import type { CreateApiKey, CreateApiKeyResponse } from "./types.ts";

type ApiKeyDialogProps = {
    onSubmit: (state: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onComplete: () => void;
    triggerLabel?: string;
    triggerColor?: "blue" | "green" | "purple" | "amber";
    triggerClassName?: string;
    /** Simplified mode: hides key type selector, permissions, budget, expiry. Shows only name + URL. */
    simplified?: boolean;
    canReceiveRewards?: boolean;
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onSubmit,
    onComplete,
    triggerLabel = "Create new key",
    triggerColor = "blue",
    triggerClassName,
    simplified = false,
    canReceiveRewards = false,
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
    const keyType: "secret" | "publishable" = simplified
        ? "publishable"
        : "secret";
    const [redirectUris, setRedirectUris] = useState<string[]>([]);
    const [byopEnabled, setByopEnabled] = useState(canReceiveRewards);
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
                ...(isPublishable &&
                    redirectUris.filter((v) => v.trim()).length > 0 && {
                        redirectUris: redirectUris
                            .map((v) => v.trim())
                            .filter(Boolean),
                    }),
                ...(isPublishable && canReceiveRewards && { byopEnabled }),
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
    const isMissingRedirectUris =
        simplified && redirectUris.filter((v) => v.trim()).length === 0;
    const isCreateDisabled =
        !createdKey &&
        (!name.trim() ||
            isSubmitting ||
            noModelsSelected ||
            isMissingRedirectUris);
    const keyTypeStyles =
        keyType === "publishable"
            ? {
                  editableInputClasses:
                      "border-blue-300 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500/60",
                  readOnlyInputClasses: "border-blue-300 bg-blue-100",
              }
            : {
                  editableInputClasses:
                      "border-violet-300 focus:outline-none focus-visible:border-violet-500 focus-visible:ring-1 focus-visible:ring-violet-500/60",
                  readOnlyInputClasses: "border-violet-300 bg-violet-100",
              };

    function getButtonText(): string {
        if (copied) return "Copied! Closing...";
        if (createdKey) return "Copy and Close";
        if (isSubmitting) return "Creating...";
        return "Create";
    }

    const createDisabledReason =
        !createdKey && noModelsSelected
            ? "Select at least one model"
            : !createdKey && isMissingRedirectUris
              ? "Add at least one redirect URL"
              : undefined;

    const submitButton = (
        <Button
            type={createdKey ? "button" : "submit"}
            onClick={createdKey ? handleCopyAndClose : undefined}
            className="disabled:opacity-50"
            disabled={isCreateDisabled}
        >
            {getButtonText()}
        </Button>
    );

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={({ open }) => {
                if (open) {
                    setCreatedKey(null);
                    setCopied(false);
                    setError(null);
                    setName(generateFunName());
                    setRedirectUris([]);
                    setByopEnabled(canReceiveRewards);
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
            <Dialog.Trigger
                className={cn(
                    "inline-flex shrink-0 self-start whitespace-nowrap",
                    triggerClassName,
                )}
            >
                <Button
                    as="div"
                    color={triggerColor}
                    weight="light"
                    className="shrink-0 whitespace-nowrap"
                >
                    {triggerLabel}
                </Button>
            </Dialog.Trigger>
            <Dialog.Backdrop className="fixed inset-0 z-[100] bg-green-950/50" />
            <Dialog.Positioner className="fixed inset-0 z-[110] flex h-dvh items-start justify-center overflow-hidden p-4">
                <Dialog.Content
                    className={cn(
                        "my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border-4 shadow-lg",
                        "bg-white border-green-950",
                    )}
                >
                    <div className="shrink-0 p-6 pb-4">
                        <Dialog.Title className="text-lg font-semibold">
                            {simplified ? "Create App Key" : "Create API Key"}
                        </Dialog.Title>
                        <div className="mt-1 text-sm text-gray-500">
                            {simplified ? (
                                <ul className="list-disc space-y-1 pl-5">
                                    <li>
                                        Register your app for{" "}
                                        <a
                                            href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
                                        >
                                            BYOP
                                        </a>
                                    </li>
                                    <li>
                                        Let your users connect and use their own
                                        pollen in your app.
                                    </li>
                                </ul>
                            ) : (
                                <p>
                                    Access AI models for text, image, and audio
                                    generation.
                                </p>
                            )}
                        </div>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-2 touch-pan-y [-webkit-overflow-scrolling:touch]">
                            {error && (
                                <div className="pb-2">
                                    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                        {error}
                                    </p>
                                </div>
                            )}

                            <hr className="border-gray-200" />
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
                                    value={createdKey ? createdKey.key : name}
                                    onChange={(e) => setName(e.target.value)}
                                    className={cn(
                                        "flex-1 px-3 py-2 border rounded-lg",
                                        createdKey
                                            ? `${keyTypeStyles.readOnlyInputClasses} font-mono text-xs`
                                            : keyTypeStyles.editableInputClasses,
                                    )}
                                    placeholder={
                                        createdKey ? "" : "Enter API key name"
                                    }
                                    required={!createdKey}
                                    disabled={isSubmitting || !!createdKey}
                                    readOnly={!!createdKey}
                                />
                            </Field.Root>

                            {!simplified && !createdKey && (
                                <p className="text-xs text-gray-500">
                                    Publishable keys (<code>pk_</code>)
                                    deprecated – create via{" "}
                                    <a
                                        href="https://gen.pollinations.ai/docs#tag/-account/POST/account/keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline hover:text-blue-800"
                                    >
                                        API
                                    </a>{" "}
                                    or{" "}
                                    <a
                                        href="https://github.com/pollinations/pollinations/tree/main/packages/polli-cli"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline hover:text-blue-800"
                                    >
                                        polli CLI
                                    </a>
                                    .
                                </p>
                            )}

                            {!simplified && createdKey && (
                                <ul className="text-xs text-gray-700 space-y-1 list-disc pl-5">
                                    <li className="text-amber-700 font-medium">
                                        Only shown once – copy it now.
                                    </li>
                                    <li>
                                        Never expose publicly – keep it in your
                                        backend.
                                    </li>
                                </ul>
                            )}

                            {simplified && !createdKey && (
                                <PublishableKeySettings
                                    redirectUris={redirectUris}
                                    onRedirectUrisChange={setRedirectUris}
                                    byopEnabled={byopEnabled}
                                    onByopEnabledChange={
                                        canReceiveRewards
                                            ? setByopEnabled
                                            : undefined
                                    }
                                    disabled={isSubmitting}
                                />
                            )}

                            {!simplified && !createdKey && (
                                <KeyPermissionsInputs
                                    value={keyPermissions}
                                    disabled={isSubmitting}
                                    inline
                                    theme="violet"
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
                            {createDisabledReason ? (
                                <Tooltip
                                    triggerAs="span"
                                    content={createDisabledReason}
                                    className="inline-flex"
                                >
                                    {submitButton}
                                </Tooltip>
                            ) : (
                                submitButton
                            )}
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
