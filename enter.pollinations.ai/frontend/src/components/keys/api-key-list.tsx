import {
    AppIcon,
    Button,
    Chip,
    GlobeIcon,
    IconButton,
    InlineLink,
    KeyChip,
    KeyIcon,
    PencilIcon,
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
import { isAppKey, isPublishableKey, readRedirectUris } from "./key-type.ts";
import { LimitsBadge, shortLocale } from "./limits-badge.tsx";
import { ModelsBadge } from "./models-badge.tsx";
import type { ApiKey, ApiKeyManagerProps } from "./types.ts";

export const ApiKeyList: FC<ApiKeyManagerProps> = ({
    apiKeys,
    onCreate,
    onUpdate,
    onDelete,
}) => {
    const [keyCreateOpen, setKeyCreateOpen] = useState(false);
    const [appCreateOpen, setAppCreateOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [editingKey, setEditingKey] = useState<ApiKey | null>(null);

    async function handleDelete(): Promise<void> {
        if (deleteId) {
            await onDelete(deleteId);
            setDeleteId(null);
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
                <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
                    <div className="flex min-w-0 items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-theme-text-muted">
                            {isApp ? (
                                <AppIcon className="h-4 w-4" />
                            ) : isPublishable ? (
                                <GlobeIcon className="h-4 w-4" />
                            ) : (
                                <KeyIcon className="h-4 w-4" />
                            )}
                            <span className="sr-only">
                                {isApp
                                    ? "App key"
                                    : isPublishable
                                      ? "Publishable key"
                                      : "Secret key"}
                            </span>
                        </span>
                        <span className="min-w-0 text-sm font-semibold leading-5 [overflow-wrap:anywhere]">
                            {apiKey.name}
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <IconButton
                            intent="info"
                            title="Edit key"
                            tooltip="Edit key"
                            tooltipAlign="center"
                            tooltipClampToViewport={false}
                            aria-haspopup="dialog"
                            onClick={() => setEditingKey(apiKey)}
                        >
                            <PencilIcon className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                            intent="danger"
                            title="Delete key"
                            tooltip="Delete key"
                            tooltipAlign="center"
                            tooltipClampToViewport={false}
                            aria-haspopup="dialog"
                            onClick={() => setDeleteId(apiKey.id)}
                        >
                            <XIcon className="h-4 w-4" />
                        </IconButton>
                    </div>
                    <div className="col-span-2 min-w-0">
                        <KeyChip
                            prefix={apiKey.start ?? ""}
                            value={isPublishable ? plaintextKey : undefined}
                            label="Copy app key"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
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

    const keyAction = (
        <Button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            aria-haspopup="dialog"
            onClick={() => setKeyCreateOpen(true)}
        >
            <KeyIcon className="h-4 w-4" />
            Add Key
        </Button>
    );
    const appAction = (
        <Button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            aria-haspopup="dialog"
            onClick={() => setAppCreateOpen(true)}
        >
            <AppIcon className="h-4 w-4" />
            Add App
        </Button>
    );

    return (
        <>
            <div className="flex flex-col gap-6">
                <Section
                    title="API"
                    framed
                    action={sortedApiKeys.length > 0 && keyAction}
                >
                    <div className="flex flex-col gap-3">
                        {!sortedApiKeys.length && (
                            <Surface className="p-6 text-center">
                                <div className="mb-2">{keyAction}</div>
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
                            your account. Keep these keys private. For a browser
                            app, create an app key and use Pollinations Connect.{" "}
                            <InlineLink
                                href={genDocsUrl("#tag/connect-user-wallets")}
                            >
                                Read the guide
                            </InlineLink>
                        </span>
                    </p>
                </Section>
                <Section
                    title="App"
                    framed
                    action={sortedAppKeys.length > 0 && appAction}
                >
                    <div className="flex flex-col gap-3">
                        {!sortedAppKeys.length && (
                            <Surface className="p-6 text-center">
                                <div className="mb-2">{appAction}</div>
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
                                Connect your app with the Pollinations SDK.
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
            {editingKey && (
                <EditApiKeyDialog
                    apiKey={editingKey}
                    onUpdate={onUpdate}
                    onClose={() => setEditingKey(null)}
                />
            )}
            <ApiKeyDialog
                open={keyCreateOpen}
                onOpenChange={setKeyCreateOpen}
                onSubmit={onCreate}
                onComplete={() => {}}
            />
            <ApiKeyDialog
                open={appCreateOpen}
                onOpenChange={setAppCreateOpen}
                onSubmit={onCreate}
                onComplete={() => {}}
                simplified
            />
        </>
    );
};
