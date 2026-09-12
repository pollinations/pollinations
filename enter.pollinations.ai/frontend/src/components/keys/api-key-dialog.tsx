import {
    Button,
    CopyButton,
    cn,
    Dialog,
    DialogTitle,
    Field,
    Heading,
    Input,
    ScrollArea,
    Text,
    Tooltip,
} from "@pollinations/ui";
import {
    AuthActionButtons,
    AuthInfoCard,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
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
    const createDisabledReason =
        !createdKey && noModelsSelected
            ? "Select at least one model"
            : undefined;

    const submitButton = createdKey ? (
        <CopyButton
            value={createdKey.key}
            variant="button"
            copiedTimeoutMs={500}
            tooltip={null}
            onCopied={closeAfterCopy}
            onCopyError={() =>
                setError(
                    "Couldn’t copy the key. Try again or copy it manually.",
                )
            }
        >
            {(copied) => (copied ? "Copied! Closing..." : "Copy and Close")}
        </CopyButton>
    ) : (
        <Button type="submit" disabled={isCreateDisabled}>
            {isSubmitting ? "Creating..." : "Create key"}
        </Button>
    );

    const nameField = (
        <Field.Root className="flex flex-col gap-2">
            <Field.Label className="text-sm font-semibold">
                {createdKey
                    ? simplified
                        ? "Your App Key"
                        : "Your API Key"
                    : "Name"}
            </Field.Label>
            <Field.Input asChild>
                <Input
                    type="text"
                    value={createdKey ? createdKey.key : name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn("w-full", createdKey && "font-mono text-xs")}
                    placeholder={createdKey ? "" : "Enter API key name"}
                    required={!createdKey}
                    disabled={isSubmitting}
                    readOnly={!!createdKey}
                />
            </Field.Input>
        </Field.Root>
    );
    const cancelButton = !createdKey && (
        <Button
            type="button"
            data-theme="neutral"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
        >
            Cancel
        </Button>
    );
    const primaryAction = createDisabledReason ? (
        <Tooltip
            triggerAs="span"
            content={createDisabledReason}
            className="inline-flex w-full"
        >
            {submitButton}
        </Tooltip>
    ) : (
        submitButton
    );

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open && isSubmitting) return;
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
            size="md"
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
            layout="flow"
        >
            <div className="shrink-0 p-6 pb-4">
                <Heading as={DialogTitle} size="section">
                    {simplified ? "Create App Key" : "Create API Key"}
                </Heading>
                <Text
                    size="xs"
                    tone="soft"
                    weight="semibold"
                    className="polli:mt-1 polli:tracking-wide"
                >
                    {simplified
                        ? createdKey
                            ? "Copy it to use in your app."
                            : "Let users connect their Pollinations account."
                        : createdKey
                          ? "Copy it now to use in your backend."
                          : "Choose what this key can access."}
                </Text>
            </div>

            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
            >
                <ScrollArea className="min-h-0 flex-1 overscroll-contain px-6 pb-2 touch-pan-y [-webkit-overflow-scrolling:touch]">
                    <div className="space-y-3">
                        {error && (
                            <div className="pb-2">
                                <ErrorBanner>{error}</ErrorBanner>
                            </div>
                        )}

                        <AuthInfoCard title={null}>{nameField}</AuthInfoCard>

                        {!simplified && createdKey && (
                            <ul className="text-xs text-ink-700 space-y-1 list-disc pl-5">
                                <li className="text-intent-warning-text font-medium">
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
                    </div>
                </ScrollArea>

                <div className="p-6 pt-4 shrink-0">
                    <AuthActionButtons
                        actions={primaryAction}
                        secondaryAction={cancelButton}
                    />
                </div>
            </form>
        </Dialog>
    );
};
