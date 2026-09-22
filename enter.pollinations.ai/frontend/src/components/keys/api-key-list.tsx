import {
    AppIcon,
    Chip,
    CopyButton,
    Dialog,
    GlobeIcon,
    IconButton,
    InlineLink,
    KeyIcon,
    LockIcon,
    PencilIcon,
    RefreshIcon,
    Section,
    Surface,
    TerminalIcon,
    TokensIcon,
    Tooltip,
    XIcon,
} from "@pollinations/ui";
import { formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { useState } from "react";
import { genDocsUrl } from "../../config.ts";
import { ApiKeyDialog } from "./api-key-dialog.tsx";
import { EditApiKeyDialog } from "./edit-api-key-dialog.tsx";
import { DeleteConfirmation } from "./key-delete-confirmation.tsx";
import { KeyDisplay } from "./key-display.tsx";
import { RotateConfirmation } from "./key-rotate-confirmation.tsx";
import { isAppKey, isPublishableKey, readRedirectUris } from "./key-type.ts";
import { LimitsBadge, shortLocale } from "./limits-badge.tsx";
import { ModelsBadge } from "./models-badge.tsx";
import type { ApiKey, ApiKeyManagerProps } from "./types.ts";

export const ApiKeyList: FC<ApiKeyManagerProps> = ({
    apiKeys,
    onCreate,
    onUpdate,
    onDelete,
    onRotate,
}) => {
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [rotateId, setRotateId] = useState<string | null>(null);
    const [rotating, setRotating] = useState(false);
    const [rotatedKey, setRotatedKey] = useState<{
        id: string;
        key: string;
        name?: string | null;
    } | null>(null);
    const [editingKey, setEditingKey] = useState<ApiKey | null>(null);

    async function handleDelete(): Promise<void> {
        if (deleteId) {
            await onDelete(deleteId);
            setDeleteId(null);
        }
    }

    async function handleRotate(): Promise<void> {
        if (!rotateId) return;
        setRotating(true);
        try {
            const created = await onRotate(rotateId);
            setRotatedKey({
                id: created.id,
                key: created.key,
                name: created.name,
            });
            setRotateId(null);
        } finally {
            setRotating(false);
        }
    }

    const now = Date.now();
    const visibleKeys = apiKeys.filter(
        (k) => !k.expiresAt || new Date(k.expiresAt).getTime() > now,
    );
    const sortedKeys = [...visibleKeys].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const sortedApiKeys = sortedKeys.filter((apiKey) => !isAppKey(apiKey));
    const sortedAppKeys = sortedKeys.filter(isAppKey);

    function renderKeyCard(apiKey: ApiKey) {
        const isPublishable = isPublishableKey(apiKey);
        const isApp = isAppKey(apiKey);
        const plaintextKey = apiKey.metadata?.plaintextKey as
            | string
            | undefined;
        const redirectUrisMeta = readRedirectUris(apiKey.metadata);
        const primaryRedirectUri = redirectUrisMeta[0] || "";
        const extraRedirectUriCount = Math.max(0, redirectUrisMeta.length - 1);
        const earningsEnabled = apiKey.metadata?.earningsEnabled === true;

        return (
            <Surface
                key={apiKey.id}
                className="transition-colors hover:bg-surface-opaque/90"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Chip size="sm">
                        {isApp ? (
                            <>
                                <AppIcon className="h-3.5 w-3.5" />
                                App
                            </>
                        ) : isPublishable ? (
                            <>
                                <GlobeIcon className="h-3.5 w-3.5" />
                                Publishable
                            </>
                        ) : (
                            <>
                                <LockIcon className="h-3.5 w-3.5" />
                                Secret
                            </>
                        )}
                    </Chip>
                    <span className="text-sm font-medium truncate">
                        {apiKey.name}
                    </span>
                    <span className="flex-1" />
                    {isPublishable && plaintextKey ? (
                        <KeyDisplay
                            fullKey={plaintextKey}
                            start={apiKey.start ?? ""}
                        />
                    ) : (
                        <span className="font-mono text-xs text-theme-text-muted shrink-0">
                            {apiKey.start}...
                        </span>
                    )}
                    <div className="flex gap-1 shrink-0 ml-2 items-center">
                        <IconButton
                            intent="info"
                            title="Edit key"
                            tooltip="Edit key"
                            tooltipAlign="center"
                            tooltipClampToViewport={false}
                            onClick={() => setEditingKey(apiKey)}
                        >
                            <PencilIcon className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                            intent="info"
                            title="Rotate key"
                            tooltip="Rotate key"
                            tooltipAlign="center"
                            tooltipClampToViewport={false}
                            onClick={() => setRotateId(apiKey.id)}
                        >
                            <RefreshIcon className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                            intent="danger"
                            title="Delete key"
                            tooltip="Delete key"
                            tooltipAlign="center"
                            tooltipClampToViewport={false}
                            onClick={() => setDeleteId(apiKey.id)}
                        >
                            <XIcon className="h-4 w-4" />
                        </IconButton>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span>
                        <span className="text-theme-text-muted">Created: </span>
                        <span className="text-theme-text-muted">
                            {formatDistanceToNowStrict(apiKey.createdAt, {
                                addSuffix: false,
                                locale: shortLocale,
                            })}
                        </span>
                    </span>
                    <span>
                        <span className="text-theme-text-muted">Used: </span>
                        <span className="text-theme-text-muted">
                            {apiKey.lastRequest
                                ? formatDistanceToNowStrict(
                                      new Date(apiKey.lastRequest),
                                      {
                                          addSuffix: false,
                                          locale: shortLocale,
                                      },
                                  )
                                : "never"}
                        </span>
                    </span>
                    {isPublishable && primaryRedirectUri && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                            <span className="text-theme-text-muted">
                                Redirect:{" "}
                            </span>
                            <a
                                href={primaryRedirectUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline truncate max-w-[200px] inline-block align-bottom text-theme-text-soft hover:text-theme-text-strong"
                            >
                                {primaryRedirectUri.replace(/^https?:\/\//, "")}
                            </a>
                            {extraRedirectUriCount > 0 && (
                                <Tooltip
                                    content={
                                        <span className="block whitespace-pre-line">
                                            Additional redirects
                                            {"\n"}
                                            {redirectUrisMeta
                                                .slice(1)
                                                .map((uri) =>
                                                    uri.replace(
                                                        /^https?:\/\//,
                                                        "",
                                                    ),
                                                )
                                                .join("\n")}
                                        </span>
                                    }
                                    displayContents
                                >
                                    <Chip size="sm">
                                        +{extraRedirectUriCount}
                                    </Chip>
                                </Tooltip>
                            )}
                        </span>
                    )}
                    {isApp && (
                        <Chip
                            intent="neutral"
                            size="sm"
                            className={
                                earningsEnabled
                                    ? "text-intent-success-text"
                                    : "bg-ink-100 text-theme-text-muted"
                            }
                        >
                            Earnings {earningsEnabled ? "on" : "off"}
                        </Chip>
                    )}
                    {!isApp && (
                        <>
                            <LimitsBadge
                                expiresAt={
                                    apiKey.expiresAt
                                        ? new Date(apiKey.expiresAt)
                                        : null
                                }
                                pollenBudget={apiKey.pollenBalance}
                            />
                            <span className="flex items-center gap-1">
                                <span className="text-theme-text-muted">
                                    Permissions:
                                </span>
                                <ModelsBadge permissions={apiKey.permissions} />
                            </span>
                        </>
                    )}
                </div>
            </Surface>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                <Section
                    title="API"
                    framed
                    action={
                        <ApiKeyDialog
                            onSubmit={onCreate}
                            onComplete={() => {}}
                            triggerLabel={
                                <span className="inline-flex items-center gap-1.5">
                                    <KeyIcon className="h-4 w-4" />
                                    Add Key
                                </span>
                            }
                        />
                    }
                >
                    <div className="flex flex-col gap-3">
                        {!sortedApiKeys.length && (
                            <Surface className="p-6 text-center">
                                <KeyIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                                <p className="font-semibold text-ink-900 text-lg mb-2">
                                    Create your first API key
                                </p>
                                <p className="text-sm text-theme-text-muted">
                                    Use API keys for your own private
                                    server-side integrations.
                                </p>
                            </Surface>
                        )}
                        {sortedApiKeys.map(renderKeyCard)}
                    </div>
                    <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                        <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            For your own backend, scripts, and CLIs — billed to
                            your account.
                        </span>
                    </p>
                </Section>
                <Section
                    title="App"
                    framed
                    action={
                        <ApiKeyDialog
                            onSubmit={onCreate}
                            onComplete={() => {}}
                            triggerLabel={
                                <span className="inline-flex items-center gap-1.5">
                                    <AppIcon className="h-4 w-4" />
                                    Add App
                                </span>
                            }
                            simplified
                        />
                    }
                >
                    <div className="flex flex-col gap-3">
                        {!sortedAppKeys.length && (
                            <Surface className="p-6 text-center">
                                <AppIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                                <p className="font-semibold text-ink-900 text-lg mb-2">
                                    Create your first app key
                                </p>
                                <p className="text-sm text-theme-text-muted">
                                    Use app keys when your users bring their own
                                    Pollinations account.
                                </p>
                            </Surface>
                        )}
                        {sortedAppKeys.map(renderKeyCard)}
                    </div>
                    <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                        <p className="flex items-start gap-1.5">
                            <GlobeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                For apps where users sign in with their own
                                Pollinations account and spend their own Pollen.
                            </span>
                        </p>
                        <p className="flex items-start gap-1.5">
                            <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Turn on earnings to receive a share of pollen
                                users spend in your app.{" "}
                                <InlineLink
                                    href={genDocsUrl(
                                        "#tag/connect-user-wallets",
                                    )}
                                >
                                    Read the guide
                                </InlineLink>
                            </span>
                        </p>
                    </div>
                </Section>
            </div>
            <DeleteConfirmation
                deleteId={deleteId}
                onConfirm={handleDelete}
                onCancel={() => setDeleteId(null)}
            />
            <RotateConfirmation
                rotateId={rotateId}
                onConfirm={handleRotate}
                onCancel={() => setRotateId(null)}
                pending={rotating}
            />
            <Dialog
                open={!!rotatedKey}
                onOpenChange={(open) => !open && setRotatedKey(null)}
                title="Key rotated"
                size="sm"
                contentClassName="p-6"
            >
                <p className="mb-4 mt-4 text-sm text-theme-text-muted">
                    Your previous key is revoked. Copy the new secret now — it
                    will not be shown again.
                </p>
                {rotatedKey && (
                    <div className="flex items-center gap-2 rounded-md border border-divider bg-surface-opaque px-3 py-2 font-mono text-sm">
                        <CopyButton
                            value={rotatedKey.key}
                            tooltip="Copy new key"
                            tooltipClassName="inline-flex min-w-0 flex-1"
                            aria-label="Copy rotated API key"
                            className={(copied) =>
                                [
                                    "min-w-0 flex-1 truncate text-left font-mono text-sm cursor-pointer transition-all",
                                    copied
                                        ? "text-intent-success-text font-semibold"
                                        : "text-theme-text-soft hover:text-theme-text-strong",
                                ].join(" ")
                            }
                        >
                            {(copied) => (copied ? "Copied!" : rotatedKey.key)}
                        </CopyButton>
                    </div>
                )}
            </Dialog>
            {editingKey && (
                <EditApiKeyDialog
                    apiKey={editingKey}
                    onUpdate={onUpdate}
                    onClose={() => setEditingKey(null)}
                />
            )}
        </>
    );
};
