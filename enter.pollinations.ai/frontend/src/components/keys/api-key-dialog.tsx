import {
    AppIcon,
    Button,
    CheckIcon,
    ClipboardIcon,
    CopyButton,
    CopyField,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogHeader,
    FieldStack,
    KeyIcon,
    XIcon,
} from "@pollinations/ui";
import { AuthInfoCard, ErrorBanner } from "@pollinations/ui/auth";
import type { FC } from "react";
import { useEffect, useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
import { DEFAULT_KEY_LIMITS } from "./key-limit-input.tsx";
import { KeyNameField } from "./key-name-field.tsx";
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
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Simplified mode: hides key type selector, permissions, budget, expiry. Shows only app key settings. */
    simplified?: boolean;
};

function generateFunName(): string {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: "-",
        length: 2,
        style: "lowerCase",
    });
}

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onSubmit,
    onComplete,
    open: isOpen,
    onOpenChange: setIsOpen,
    simplified = false,
}) => {
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
            : DEFAULT_KEY_LIMITS,
    );
    const {
        setAllowedModels,
        setAccountPermissions,
        setPollenBudget,
        setExpiryDays,
    } = keyPermissions;
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
        null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const isCreateDisabled = !createdKey && (!name.trim() || isSubmitting);
    useEffect(() => {
        if (!isOpen) {
            if (!simplified) {
                setAllowedModels(null);
                setAccountPermissions([]);
                setPollenBudget(DEFAULT_KEY_LIMITS.pollenBudget);
                setExpiryDays(DEFAULT_KEY_LIMITS.expiryDays);
            }
            return;
        }

        setCreatedKey(null);
        setError(null);
        setName(generateFunName());
        setRedirectUris(simplified ? [DEFAULT_LOCALHOST_REDIRECT] : []);
        setEarningsEnabled(true);
        const dateStr = new Date().toLocaleDateString("en-US", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
        setDescription(simplified ? "" : `Created on ${dateStr}`);
    }, [
        isOpen,
        simplified,
        setAllowedModels,
        setAccountPermissions,
        setPollenBudget,
        setExpiryDays,
    ]);

    const submitButton = createdKey ? (
        <CopyButton
            value={createdKey.key}
            variant="button"
            intent="brand"
            copiedTimeoutMs={500}
            tooltip={null}
            onCopied={closeAfterCopy}
            onCopyError={() =>
                setError(
                    "Couldn’t copy the key. Select it and copy it manually before closing.",
                )
            }
        >
            {(copied) => (
                <span className="inline-flex items-center gap-2">
                    <span
                        aria-hidden="true"
                        className="flex size-4 shrink-0 [&>svg]:size-full"
                    >
                        {copied ? <CheckIcon /> : <ClipboardIcon />}
                    </span>
                    {copied ? "Copied" : "Copy and close"}
                </span>
            )}
        </CopyButton>
    ) : (
        <Button
            icon={simplified ? <AppIcon /> : <KeyIcon />}
            type="submit"
            intent="brand"
            className="disabled:opacity-50"
            disabled={isCreateDisabled}
        >
            {isSubmitting
                ? "Creating…"
                : simplified
                  ? "Create app key"
                  : "Create API key"}
        </Button>
    );

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen} size="md">
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
                    <AuthInfoCard>
                        {createdKey ? (
                            <FieldStack
                                label={
                                    <span className="inline-flex items-center gap-1.5">
                                        {simplified ? (
                                            <AppIcon
                                                aria-hidden="true"
                                                className="h-4 w-4"
                                            />
                                        ) : (
                                            <KeyIcon
                                                aria-hidden="true"
                                                className="h-4 w-4"
                                            />
                                        )}
                                        {simplified ? "App key" : "Secret key"}
                                    </span>
                                }
                                helper={
                                    !simplified
                                        ? "Keep this key in your backend. Don’t share it or include it in public code."
                                        : undefined
                                }
                            >
                                <CopyField
                                    value={createdKey.key}
                                    label={
                                        simplified
                                            ? "Copy app key"
                                            : "Copy secret key"
                                    }
                                />
                            </FieldStack>
                        ) : (
                            <KeyNameField
                                app={simplified}
                                value={name}
                                onChange={setName}
                                disabled={isSubmitting}
                            />
                        )}
                    </AuthInfoCard>
                    {simplified && !createdKey && (
                        <PublishableKeySettings
                            redirectUris={redirectUris}
                            onRedirectUrisChange={setRedirectUris}
                            earningsEnabled={earningsEnabled}
                            onEarningsEnabledChange={setEarningsEnabled}
                            disabled={isSubmitting}
                        />
                    )}

                    {isOpen && !simplified && !createdKey && (
                        <KeyPermissionsInputs
                            value={keyPermissions}
                            disabled={isSubmitting}
                        />
                    )}
                </DialogBody>

                <DialogFooter>
                    <Button
                        icon={<XIcon />}
                        type="button"
                        intent="neutral"
                        onClick={() => {
                            if (createdKey) onComplete();
                            setIsOpen(false);
                        }}
                        className="disabled:opacity-50"
                        disabled={isSubmitting}
                    >
                        {createdKey ? "Close" : "Cancel"}
                    </Button>
                    {submitButton}
                </DialogFooter>
            </form>
        </Dialog>
    );
};
