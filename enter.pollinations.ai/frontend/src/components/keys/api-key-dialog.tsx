import {
    AppIcon,
    Button,
    CheckIcon,
    CopyButton,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogHeader,
    Field,
    FieldStack,
    Input,
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

const DEFAULT_KEY_LIMITS = { pollenBudget: 5, expiryDays: 7 };

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
    const { setPollenBudget, setExpiryDays } = keyPermissions;
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
    }, [isOpen, simplified, setPollenBudget, setExpiryDays]);

    const submitButton = createdKey ? (
        <CopyButton
            value={createdKey.key}
            variant="button"
            copiedTimeoutMs={500}
            tooltip={null}
            onCopied={closeAfterCopy}
            onCopyError={() =>
                setError(
                    "Couldn’t copy the key. Select it and copy it manually before closing.",
                )
            }
        >
            {(copied) => (copied ? "Copied" : "Copy and close")}
        </CopyButton>
    ) : (
        <Button
            icon={simplified ? <AppIcon /> : <KeyIcon />}
            type="submit"
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
                icon={simplified ? <AppIcon /> : <KeyIcon />}
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
                                label={simplified ? "App key" : "Secret key"}
                                helper={
                                    !simplified
                                        ? "Keep this key in your backend. Don’t share it or include it in public code."
                                        : undefined
                                }
                            >
                                <Field.Input asChild>
                                    <Input
                                        type="text"
                                        value={createdKey.key}
                                        className="font-mono text-xs"
                                        readOnly
                                    />
                                </Field.Input>
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
                        icon={createdKey ? <CheckIcon /> : <XIcon />}
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
