import { apiClient } from "@frontend/api.ts";
import {
    AppIcon,
    Button,
    Chip,
    CopyButton,
    cn,
    Dialog,
    DialogTitle,
    Field,
    GlobeIcon,
    Heading,
    Input,
    LockIcon,
    ScrollArea,
} from "@pollinations/ui";
import {
    AuthActionButtons,
    AuthFlowLayout,
    AuthInfoCard,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { FC, ReactNode } from "react";
import { useId, useState } from "react";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";
import {
    isAppKey,
    isPublishableKey,
    readRedirectUris,
    shouldPostKeyMetadata,
} from "./key-type.ts";
import { PublishableKeySettings } from "./publishable-key-settings.tsx";
import type { ApiKey, ApiKeyUpdateParams } from "./types.ts";

interface EditApiKeyDialogProps {
    apiKey: ApiKey;
    title?: string;
    presentation?: "dialog" | "page";
    account?: ReactNode;
    secondaryAction?: ReactNode;
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onClose: () => void;
}

function cleanRedirectUris(uris: string[]): string[] {
    return uris.map((v) => v.trim()).filter((v) => v !== "");
}

export const EditApiKeyDialog: FC<EditApiKeyDialogProps> = ({
    apiKey,
    title,
    presentation = "dialog",
    account,
    secondaryAction,
    onUpdate,
    onClose,
}) => {
    const formId = useId();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [name, setName] = useState(apiKey.name || "");
    const [error, setError] = useState<string | null>(null);

    const isPublishable = isPublishableKey(apiKey);
    const appKey = isAppKey(apiKey);
    const plaintextKey = apiKey.metadata?.plaintextKey as string | undefined;

    const initialRedirectUris = readRedirectUris(apiKey.metadata);
    const initialEarningsEnabled = apiKey.metadata?.earningsEnabled === true;
    const [redirectUris, setRedirectUris] =
        useState<string[]>(initialRedirectUris);
    const [earningsEnabled, setEarningsEnabled] = useState(
        initialEarningsEnabled,
    );

    const expiryDays = apiKey.expiresAt
        ? Math.ceil(
              (new Date(apiKey.expiresAt).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
          )
        : null;

    const keyPermissions = useKeyPermissions({
        allowedModels: apiKey.permissions?.models ?? null,
        pollenBudget: apiKey.pollenBalance ?? null,
        accountPermissions: apiKey.permissions?.account ?? null,
        expiryDays,
    });

    async function handleSave() {
        setIsSubmitting(true);
        setError(null);
        try {
            // Metadata must post before onUpdate: onUpdate ends in
            // router.invalidate(), which would refetch the key list before this
            // write lands and close the dialog onto a stale card.
            const cleaned = cleanRedirectUris(redirectUris);
            if (
                shouldPostKeyMetadata(apiKey, {
                    redirectUris: cleaned,
                    earningsEnabled,
                })
            ) {
                const metaRes = await apiClient["api-keys"][
                    ":id"
                ].metadata.$post({
                    param: { id: apiKey.id },
                    json: { redirectUris: cleaned, earningsEnabled },
                });
                if (!metaRes.ok) {
                    const err = await metaRes.json().catch(() => null);
                    throw new Error(
                        (err as { error?: { message?: string } })?.error
                            ?.message || "Failed to save key metadata",
                    );
                }
            }

            const { expiryDays, ...permissions } = keyPermissions.permissions;
            await onUpdate(apiKey.id, {
                name,
                ...permissions,
                expiresAt: expiryDays
                    ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
                    : null,
            });

            onClose();
        } catch (error) {
            console.error("Failed to update API key:", error);
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to update API key",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const identity = (
        <div className="flex items-center gap-3">
            <Chip>
                {appKey ? (
                    <>
                        <AppIcon className="h-4 w-4" />
                        App
                    </>
                ) : isPublishable ? (
                    <>
                        <GlobeIcon className="h-4 w-4" />
                        Publishable
                    </>
                ) : (
                    <>
                        <LockIcon className="h-4 w-4" />
                        Secret
                    </>
                )}
            </Chip>
            {isPublishable && plaintextKey ? (
                <CopyButton
                    value={plaintextKey}
                    tooltipClassName="inline-flex min-w-0"
                    aria-label="Copy publishable API key"
                    className={(copied) =>
                        cn(
                            "font-mono text-sm cursor-pointer transition-all",
                            copied
                                ? "text-intent-success-text font-semibold"
                                : "text-theme-text-soft hover:text-theme-text-strong hover:underline",
                        )
                    }
                >
                    {(copied) => (copied ? "Copied!" : plaintextKey)}
                </CopyButton>
            ) : (
                <span className="font-mono text-sm text-theme-text-muted">
                    {apiKey.start}...
                </span>
            )}
        </div>
    );
    const fields = (
        <form
            id={formId}
            className="space-y-3"
            onSubmit={(event) => {
                event.preventDefault();
                if (!isSubmitting) void handleSave();
            }}
        >
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <AuthInfoCard title={null}>
                {identity}
                <Field.Root className="flex flex-col gap-2">
                    <Field.Label className="text-sm font-semibold">
                        Name
                    </Field.Label>
                    <Field.Input asChild>
                        <Input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full"
                            placeholder="Enter API key name"
                            required
                            disabled={isSubmitting}
                        />
                    </Field.Input>
                </Field.Root>
            </AuthInfoCard>
            {isPublishable && (
                <PublishableKeySettings
                    redirectUris={redirectUris}
                    onRedirectUrisChange={setRedirectUris}
                    earningsEnabled={earningsEnabled}
                    onEarningsEnabledChange={setEarningsEnabled}
                    disabled={isSubmitting}
                />
            )}

            {!isPublishable && (
                <KeyPermissionsInputs
                    value={keyPermissions}
                    disabled={isSubmitting}
                    inline
                />
            )}
            {secondaryAction}
        </form>
    );
    const cancel = (
        <Button
            type="button"
            data-theme="neutral"
            onClick={onClose}
            disabled={isSubmitting}
        >
            Cancel
        </Button>
    );
    const save = (
        <Button
            type="submit"
            form={formId}
            disabled={isSubmitting || !name.trim()}
        >
            {isSubmitting ? "Saving..." : "Save"}
        </Button>
    );
    const heading = title ?? (appKey ? "Edit App Key" : "Edit API Key");

    // The standalone route changes only the shell. The dashboard and page
    // share every field, validation rule and save operation above.
    if (presentation === "page")
        return (
            <AuthFlowLayout
                account={account}
                actions={save}
                secondaryAction={cancel}
                dialog={{ labelledBy: "app-access-title" }}
            >
                <div className="space-y-2 pt-3">
                    <Heading as="h1" size="section" id="app-access-title">
                        {heading}
                    </Heading>
                    <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                        Manage permissions and spending limits for{" "}
                        {apiKey.name || "this app"}.
                    </p>
                </div>
                {fields}
            </AuthFlowLayout>
        );

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && !isSubmitting && onClose()}
            layout="flow"
        >
            <div className="shrink-0 p-6 pb-4">
                <Heading as={DialogTitle} size="section">
                    {heading}
                </Heading>
            </div>
            <ScrollArea className="min-h-0 flex-1 overscroll-contain px-6 pb-2 touch-pan-y [-webkit-overflow-scrolling:touch]">
                {fields}
            </ScrollArea>
            <div className="p-6 pt-4 shrink-0">
                <AuthActionButtons secondaryAction={cancel} actions={save} />
            </div>
        </Dialog>
    );
};
