import { formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { useState } from "react";
import { genDocsUrl } from "../../config.ts";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import { Card } from "../ui/card.tsx";
import { IconButton } from "../ui/icon-button.tsx";
import { Tag } from "../ui/tag.tsx";
import { AccountBadge } from "./account-badge.tsx";
import { ApiKeyDialog } from "./api-key-dialog.tsx";
import { DeleteConfirmation } from "./delete-confirmation.tsx";
import { EditApiKeyDialog } from "./edit-api-key-dialog.tsx";
import { KeyDisplay } from "./key-display.tsx";
import { LimitsBadge, shortLocale } from "./limits-badge.tsx";
import { ModelsBadge } from "./models-badge.tsx";
import type { ApiKey, ApiKeyManagerProps } from "./types.ts";

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

    function isAppKey(apiKey: ApiKey): boolean {
        return apiKey.metadata?.keyType === "publishable";
    }

    function renderKeyCard(apiKey: ApiKey) {
        const isPublishable = apiKey.metadata?.keyType === "publishable";
        const plaintextKey = apiKey.metadata?.plaintextKey as
            | string
            | undefined;
        const redirectUrisMeta = Array.isArray(apiKey.metadata?.redirectUris)
            ? (apiKey.metadata?.redirectUris as string[])
            : [];
        const primaryRedirectUri = redirectUrisMeta[0] || "";
        const extraRedirectUriCount = Math.max(0, redirectUrisMeta.length - 1);
        const isApp = isPublishable;
        const earningsEnabled = apiKey.metadata?.earningsEnabled === true;

        return (
            <Card
                key={apiKey.id}
                color="blue"
                className="!border-transparent transition-colors hover:bg-white/90"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Tag color="blue" size="sm">
                        {isPublishable ? "🖥️ App" : "🔒 Secret"}
                    </Tag>
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
                        <span className="font-mono text-xs text-gray-500 shrink-0">
                            {apiKey.start}...
                        </span>
                    )}
                    <div className="flex gap-1 shrink-0 ml-2 items-center">
                        <IconButton
                            color="blue"
                            title="Edit key"
                            onClick={() => setEditingKey(apiKey)}
                        >
                            ✎
                        </IconButton>
                        <IconButton
                            color="red"
                            title="Delete key"
                            onClick={() => setDeleteId(apiKey.id)}
                            className="text-lg"
                        >
                            ×
                        </IconButton>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span>
                        <span className="text-gray-400">Created: </span>
                        <span className="text-gray-500">
                            {formatDistanceToNowStrict(apiKey.createdAt, {
                                addSuffix: false,
                                locale: shortLocale,
                            })}
                        </span>
                    </span>
                    <span>
                        <span className="text-gray-400">Used: </span>
                        <span className="text-gray-500">
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
                            <span className="text-gray-400">Redirect: </span>
                            <a
                                href={primaryRedirectUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline truncate max-w-[200px] inline-block align-bottom text-blue-600"
                            >
                                {primaryRedirectUri.replace(/^https?:\/\//, "")}
                            </a>
                            {extraRedirectUriCount > 0 && (
                                <span
                                    className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700"
                                    title={redirectUrisMeta
                                        .slice(1)
                                        .map((uri) =>
                                            uri.replace(/^https?:\/\//, ""),
                                        )
                                        .join("\n")}
                                >
                                    +{extraRedirectUriCount}
                                </span>
                            )}
                        </span>
                    )}
                    {isApp && (
                        <span
                            className={`rounded px-2 py-0.5 font-medium ${
                                earningsEnabled
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-500"
                            }`}
                            title="Developer earnings"
                        >
                            Earnings {earningsEnabled ? "on" : "off"}
                        </span>
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
                                <span className="text-gray-400">
                                    Permissions:
                                </span>
                                <span className="flex items-center gap-1">
                                    <ModelsBadge
                                        permissions={apiKey.permissions}
                                    />
                                    <AccountBadge
                                        permissions={apiKey.permissions}
                                    />
                                </span>
                            </span>
                        </>
                    )}
                </div>
            </Card>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                <DashboardSection title="API" theme="blue" framed>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <p className="min-w-0 flex-1 text-sm text-gray-600">
                                For your own backend, scripts, and CLIs — billed
                                to your account.
                            </p>
                            <ApiKeyDialog
                                onSubmit={onCreate}
                                onComplete={() => {}}
                                triggerLabel="🔑 + API Key"
                            />
                        </div>
                        {!sortedApiKeys.length && (
                            <Card
                                color="blue"
                                className="!border-transparent p-6 text-center"
                            >
                                <p className="text-2xl mb-2">🔑</p>
                                <p className="font-semibold text-gray-900 text-lg mb-2">
                                    Create your first API key
                                </p>
                                <p className="text-sm text-gray-600">
                                    Use API keys for your own private
                                    server-side integrations.
                                </p>
                            </Card>
                        )}
                        {sortedApiKeys.map(renderKeyCard)}
                    </div>
                </DashboardSection>
                <DashboardSection title="App" theme="blue" framed>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1 text-sm text-gray-600">
                                <p>
                                    For apps where users sign in with their own
                                    Pollinations account and spend their own
                                    Pollen.
                                </p>
                                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                                    <span className="font-body text-[11px] font-bold uppercase tracking-wide text-red-600 mr-1.5">
                                        New!
                                    </span>
                                    Turn on developer earnings. Users are billed
                                    25% extra, credited to your wallet.{" "}
                                    <a
                                        href={genDocsUrl(
                                            "#tag/bring-your-own-pollen",
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-blue-700 hover:text-blue-900"
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
                                </p>
                            </div>
                            <ApiKeyDialog
                                onSubmit={onCreate}
                                onComplete={() => {}}
                                triggerLabel="🖥️ + Add App"
                                simplified
                            />
                        </div>
                        {!sortedAppKeys.length && (
                            <Card
                                color="blue"
                                className="!border-transparent p-6 text-center"
                            >
                                <p className="text-2xl mb-2">🖥️</p>
                                <p className="font-semibold text-gray-900 text-lg mb-2">
                                    Create your first app key
                                </p>
                                <p className="text-sm text-gray-600">
                                    Use app keys when your users bring their own
                                    Pollinations account.
                                </p>
                            </Card>
                        )}
                        {sortedAppKeys.map(renderKeyCard)}
                    </div>
                </DashboardSection>
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
