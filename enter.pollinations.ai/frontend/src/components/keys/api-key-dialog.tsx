import {
    Button,
    CopyButton,
    cn,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogHeader,
    Field,
    InlineLink,
    Input,
} from "@pollinations/ui";
import { ErrorBanner } from "@pollinations/ui/auth";
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
    const submitButton = createdKey ? (
        <CopyButton
            value={createdKey.key}
            copiedTimeoutMs={500}
            tooltip={null}
            onCopied={closeAfterCopy}
            onCopyError={() =>
                setError(
                    "Couldn’t copy the key. Select it and copy it manually before closing.",
                )
            }
            className="inline-flex items-center justify-center self-center rounded-full bg-theme-bg-active px-4 pb-2 pt-1.5 font-medium leading-normal text-theme-text-strong transition-colors hover:bg-theme-bg-hover hover:brightness-105"
        >
            {(copied) => (copied ? "Copied" : "Copy and close")}
        </CopyButton>
    ) : (
        <Button
            type="submit"
            className="disabled:opacity-50"
            disabled={isCreateDisabled}
        >
            {isSubmitting ? "Creating…" : "Create key"}
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
        >
            <DialogHeader
                title={
                    createdKey
                        ? simplified
                            ? "App key created"
                            : "API key created"
                        : simplified
                          ? "Create app key"
                          : "Create API key"
                }
                description={
                    createdKey
                        ? simplified
                            ? "Use this app key to connect your app to Pollinations."
                            : "Copy your secret key now. You won’t be able to see it again."
                        : simplified
                          ? "Let users connect their Pollinations accounts and spend their own Pollen in your app."
                          : "Create a secret key for API requests from your backend."
                }
            />

            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
            >
                <DialogBody>
                    {error && <ErrorBanner>{error}</ErrorBanner>}
                    <Field.Root className="flex flex-col gap-2">
                        <Field.Label className="text-sm font-semibold">
                            {createdKey
                                ? simplified
                                    ? "App key"
                                    : "Secret key"
                                : "Name"}
                        </Field.Label>
                        <Field.Input asChild>
                            <Input
                                type="text"
                                value={createdKey ? createdKey.key : name}
                                onChange={(e) => setName(e.target.value)}
                                className={cn(
                                    "w-full",
                                    createdKey && "font-mono text-xs",
                                )}
                                placeholder="Key name"
                                required={!createdKey}
                                disabled={isSubmitting}
                                readOnly={!!createdKey}
                            />
                        </Field.Input>
                    </Field.Root>

                    {!createdKey && (
                        <p className="text-sm text-theme-text-muted">
                            {simplified
                                ? "Add your app’s callback URLs below, then integrate Pollinations Connect with the SDK. "
                                : "Keep this key private. For a browser app, create an app key and use Pollinations Connect. "}
                            <InlineLink
                                href={genDocsUrl("#tag/connect-user-wallets")}
                            >
                                Read the guide
                            </InlineLink>
                        </p>
                    )}
                    {!simplified && createdKey && (
                        <p className="text-sm text-theme-text-muted">
                            Keep this key in your backend. Don’t share it or
                            include it in public code.
                        </p>
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
                    {!createdKey && noModelsSelected && (
                        <output className="block text-sm text-theme-text-muted">
                            Select at least one model to create this key.
                        </output>
                    )}
                </DialogBody>

                <DialogFooter>
                    <Button
                        type="button"
                        intent="neutral"
                        onClick={() => {
                            if (createdKey) onComplete();
                            setIsOpen(false);
                        }}
                        className="disabled:opacity-50"
                        disabled={isSubmitting}
                    >
                        {createdKey ? "Done" : "Cancel"}
                    </Button>
                    {submitButton}
                </DialogFooter>
            </form>
        </Dialog>
    );
};
