import {
    AppIcon,
    Chip,
    IconButton,
    Section,
    Surface,
    TerminalIcon,
    Tooltip,
} from "@pollinations/ui";
import { formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { useState } from "react";
import { genDocsUrl } from "../../config.ts";
import { ApiKeyDialog } from "./api-key-dialog.tsx";
import { EditApiKeyDialog } from "./edit-api-key-dialog.tsx";
import { DeleteConfirmation } from "./key-delete-confirmation.tsx";
import { KeyDisplay } from "./key-display.tsx";
import { LimitsBadge, shortLocale } from "./limits-badge.tsx";
import { ModelsBadge } from "./models-badge.tsx";
import type { ApiKey, ApiKeyManagerProps } from "./types.ts";

function isPublishableKey(apiKey: ApiKey): boolean {
    return apiKey.metadata?.keyType === "publishable";
}

function isAppKey(apiKey: ApiKey): boolean {
    if (!isPublishableKey(apiKey)) return false;

    const redirectUris = apiKey.metadata?.redirectUris;
    const hasRedirectUris =
        Array.isArray(redirectUris) &&
        redirectUris.some(
            (uri) => typeof uri === "string" && uri.trim().length > 0,
        );

    return hasRedirectUris || apiKey.metadata?.earningsEnabled === true;
}

export const ApiKeyList: FC<ApiKeyManagerProps> = ({
    apiKeys,
    onCreate,
    onUpdate,
    onDelete,
}) => {
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
        const redirectUrisMeta = Array.isArray(apiKey.metadata?.redirectUris)
            ? (apiKey.metadata?.redirectUris as string[])
            : [];
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
                        {isApp
                            ? "🖥️ App"
                            : isPublishable
                              ? "🌐 Publishable"
                              : "🔒 Secret"}
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
                            title="Edit key"
                            tooltip="✏️ Edit key"
                            tooltipAlign="center"
                            tooltipClampToViewport={false}
                            onClick={() => setEditingKey(apiKey)}
                        >
                            ✎
                        </IconButton>
                        <IconButton
                            intent="danger"
                            title="Delete key"
                            tooltip="🗑️ Delete key"
                            tooltipAlign="center"
                            tooltipClampToViewport={false}
                            onClick={() => setDeleteId(apiKey.id)}
                            className="text-lg"
                        >
                            ×
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
                                            ↪️ Additional redirects
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
                            intent={earningsEnabled ? "success" : undefined}
                            size="sm"
                            className={
                                earningsEnabled
                                    ? undefined
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
                            triggerLabel="🔑 + API Key"
                        />
                    }
                >
                    <div className="flex flex-col gap-3">
                        {!sortedApiKeys.length && (
                            <Surface className="p-6 text-center">
                                <p className="text-2xl mb-2">🔑</p>
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
                    <p className="mt-5 flex items-start gap-1.5 border-t border-divider pt-5 text-[13px] leading-snug text-theme-text-muted">
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
                            triggerLabel="🖥️ + Add App"
                            simplified
                        />
                    }
                >
                    <div className="flex flex-col gap-3">
                        <Surface
                            variant="card-themed"
                            className="w-fit text-theme-text-strong"
                        >
                            <span className="font-body text-xs font-bold uppercase tracking-wide text-intent-danger-text mr-1.5">
                                New!
                            </span>
                            Turn on earnings to receive a share of pollen users
                            spend in your app.{" "}
                            <a
                                href={genDocsUrl("#tag/bring-your-own-pollen")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-theme-text-soft hover:text-theme-text-strong"
                            >
                                <span className="underline underline-offset-2">
                                    Read the guide
                                </span>
                                <span
                                    aria-hidden="true"
                                    className="no-underline ml-0.5"
                                >
                                    ↗
                                </span>
                            </a>
                        </Surface>
                        {!sortedAppKeys.length && (
                            <Surface className="p-6 text-center">
                                <p className="text-2xl mb-2">🖥️</p>
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
                    <p className="mt-5 flex items-start gap-1.5 border-t border-divider pt-5 text-[13px] leading-snug text-theme-text-muted">
                        <AppIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            For apps where users sign in with their own
                            Pollinations account and spend their own Pollen.
                        </span>
                    </p>
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
        </>
    );
};
