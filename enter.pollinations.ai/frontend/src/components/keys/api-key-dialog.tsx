import {
    Button,
    CopyButton,
    cn,
    Dialog,
    DialogTitle,
    Field,
    Input,
    ScrollArea,
    Tooltip,
} from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
import { genDocsUrl } from "../../config.ts";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import { PublishableKeySettings } from "./publishable-key-settings.tsx";
import type { CreateApiKey, CreateApiKeyResponse } from "./types.ts";

/**
 * Pre-filled callback for app keys so local dev works out of the box. Loopback
 * ports are wildcarded (RFC 8252 §7.3), so only the path needs editing. The
 * dev sees it in the editor and should remove it before production.
 */
const DEFAULT_LOCALHOST_REDIRECT = "http://localhost/callback";

type ApiKeyDialogProps = {
    onSubmit: (state: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onComplete: () => void;
    triggerLabel?: ReactNode;
    triggerClassName?: string;
    /** Simplified mode: hides key type selector, permissions, budget, expiry. Shows only app key settings. */
    simplified?: boolean;
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onSubmit,
    onComplete,
    triggerLabel = "Create new key",
    triggerClassName,
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
    const keyType: "secret" | "publishable" = simplified
        ? "publishable"
        : "secret";
    const [redirectUris, setRedirectUris] = useState<string[]>(
        simplified ? [DEFAULT_LOCALHOST_REDIRECT] : [],
    );
    const [earningsEnabled, setEarningsEnabled] = useState(true);
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
                ...(isPublishable && { earningsEnabled }),
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

    function closeAfterCopy() {
        setTimeout(() => {
            onComplete();
            setIsOpen(false);
        }, 500);
    }

    const { allowedModels } = keyPermissions.permissions;
    const noModelsSelected =
        !simplified &&
        Array.isArray(allowedModels) &&
        allowedModels.length === 0;
    const isCreateDisabled =
        !createdKey && (!name.trim() || isSubmitting || noModelsSelected);
    function getButtonText(): string {
        if (isSubmitting) return "Creating...";
        return "Create";
    }

    const createDisabledReason =
        !createdKey && noModelsSelected
            ? "Select at least one model"
            : undefined;

    const submitButton = createdKey ? (
        <CopyButton
            value={createdKey.key}
            copiedTimeoutMs={500}
            tooltip="Copy key"
            copiedTooltip="Copied! Closing..."
            onCopied={closeAfterCopy}
            onCopyError={() => {
                onComplete();
                setIsOpen(false);
            }}
            className="inline-flex items-center justify-center self-center rounded-full bg-theme-bg-active px-4 pb-2 pt-1.5 font-medium leading-normal text-theme-text-strong transition-colors hover:bg-theme-bg-hover hover:brightness-105"
        >
            {(copied) => (copied ? "Copied! Closing..." : "Copy and Close")}
        </CopyButton>
    ) : (
        <Button
            type="submit"
            className="disabled:opacity-50"
            disabled={isCreateDisabled}
        >
            {getButtonText()}
        </Button>
    );

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (open) {
                    setCreatedKey(null);
                    setError(null);
                    setName(generateFunName());
                    setRedirectUris(
                        simplified ? [DEFAULT_LOCALHOST_REDIRECT] : [],
                    );
                    setEarningsEnabled(true);
                    const dateStr = new Date().toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                    });
                    setDescription(simplified ? "" : `Created on ${dateStr}`);
                }
                setIsOpen(open);
            }}
            size="lg"
            trigger={
                <Button
                    type="button"
                    className={cn(
                        "inline-flex shrink-0 self-start whitespace-nowrap",
                        triggerClassName,
                    )}
                >
                    {triggerLabel}
                </Button>
            }
            triggerAsChild
            contentClassName="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
            <div className="shrink-0 p-6 pb-4">
                <DialogTitle className="text-lg font-semibold">
                    {simplified ? "Create App Key" : "Create API Key"}
                </DialogTitle>
                <div className="mt-1 text-sm text-theme-text-muted">
                    {simplified ? (
                        <ul className="list-disc space-y-1 pl-5">
                            <li>
                                For web apps, add the callback URL your app will
                                use after consent.
                            </li>
                            <li>
                                We return a scoped API key in the URL fragment.
                            </li>
                            <li>
                                Use that key for API requests paid with the
                                user&apos;s Pollen.{" "}
                                <a
                                    href={genDocsUrl(
                                        "#tag/bring-your-own-pollen",
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-theme-text-soft underline hover:text-theme-text-strong"
                                >
                                    Read the guide
                                </a>
                            </li>
                        </ul>
                    ) : (
                        <p>
                            Access AI models for text, image, audio, video, and
                            embeddings.
                        </p>
                    )}
                </div>
            </div>

            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
            >
                <ScrollArea className="min-h-0 flex-1 space-y-4 overscroll-contain px-6 pb-2 touch-pan-y [-webkit-overflow-scrolling:touch]">
                    {error && (
                        <div className="pb-2">
                            <p className="text-sm text-intent-danger-text bg-intent-danger-bg-light px-3 py-2 rounded-lg">
                                {error}
                            </p>
                        </div>
                    )}

                    <hr className="border-divider" />
                    <Field.Root className="flex flex-col gap-2">
                        <Field.Label className="text-sm font-semibold">
                            {createdKey
                                ? simplified
                                    ? "Your App Key"
                                    : "Your API Key"
                                : "Name"}
                        </Field.Label>
                        <Input
                            type="text"
                            value={createdKey ? createdKey.key : name}
                            onChange={(e) => setName(e.target.value)}
                            className={cn(
                                "w-full",
                                createdKey && "font-mono text-xs",
                            )}
                            placeholder={createdKey ? "" : "Enter API key name"}
                            required={!createdKey}
                            disabled={isSubmitting || !!createdKey}
                            readOnly={!!createdKey}
                        />
                    </Field.Root>

                    {!simplified && !createdKey && (
                        <p className="text-xs text-theme-text-muted">
                            Publishable keys (<code>pk_</code>) deprecated –
                            create via{" "}
                            <a
                                href={genDocsUrl(
                                    "#tag/-account/POST/account/keys",
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-theme-text-soft underline hover:text-theme-text-strong"
                            >
                                API
                            </a>{" "}
                            or{" "}
                            <a
                                href="https://github.com/pollinations/pollinations/tree/main/packages/polli-cli"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-theme-text-soft underline hover:text-theme-text-strong"
                            >
                                polli CLI
                            </a>
                            .
                        </p>
                    )}

                    {!simplified && createdKey && (
                        <ul className="text-xs text-ink-700 space-y-1 list-disc pl-5">
                            <li className="text-intent-warning-text font-medium">
                                Only shown once – copy it now.
                            </li>
                            <li>
                                Never expose publicly – keep it in your backend.
                            </li>
                        </ul>
                    )}

                    {simplified && !createdKey && (
                        <PublishableKeySettings
                            redirectUris={redirectUris}
                            onRedirectUrisChange={setRedirectUris}
                            earningsEnabled={earningsEnabled}
                            onEarningsEnabledChange={setEarningsEnabled}
                            disabled={isSubmitting}
                        />
                    )}

                    {!simplified && !createdKey && (
                        <KeyPermissionsInputs
                            value={keyPermissions}
                            disabled={isSubmitting}
                            inline
                        />
                    )}
                </ScrollArea>

                <div className="flex gap-2 justify-end p-6 pt-4 shrink-0">
                    {!createdKey && (
                        <Button
                            type="button"
                            intent="danger"
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
        </Dialog>
    );
};
