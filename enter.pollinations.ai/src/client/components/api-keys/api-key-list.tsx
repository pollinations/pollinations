import { formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Panel } from "../ui/panel.tsx";
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

    const sortedKeys = [...apiKeys].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return (
        <>
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                    <h2 className="font-bold flex-1">Keys</h2>
                    <div className="flex gap-3">
                        <ApiKeyDialog
                            onSubmit={onCreate}
                            onComplete={() => {}}
                            triggerLabel="🖥️ + App Key"
                            triggerColor="blue"
                            simplified
                        />
                        <ApiKeyDialog
                            onSubmit={onCreate}
                            onComplete={() => {}}
                            triggerLabel="🔑 + API Key"
                            triggerColor="blue"
                        />
                    </div>
                </div>
                <Panel color="blue">
                    <div className="flex flex-col gap-3">
                        {!apiKeys.length && (
                            <div className="rounded-xl bg-white/80 p-6 text-center">
                                <p className="text-2xl mb-2">🔑</p>
                                <p className="font-semibold text-gray-900 text-lg mb-2">
                                    Create your first key
                                </p>
                                <p className="text-sm text-gray-600 mb-1">
                                    <strong>🔒 API Key</strong> — access models
                                    with your pollen
                                </p>
                                <p className="text-sm text-gray-600">
                                    <strong>🖥️ App Key</strong> — users bring
                                    their own pollen into your app
                                </p>
                            </div>
                        )}
                        {apiKeys.length > 0 && (
                            <div className="rounded-xl bg-amber-50/80 p-4">
                                <p className="font-semibold text-amber-900 mb-1">
                                    🐝 Let your users bring their own Pollen
                                </p>
                                <p className="text-sm text-amber-800">
                                    Register an <strong>App Key</strong> so
                                    users can sign in with their own
                                    Pollinations account — web apps, chatbots,
                                    CLIs, anything. Track usage and activity in
                                    your app.{" "}
                                    <a
                                        href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-amber-700 hover:text-amber-900 underline underline-offset-2"
                                    >
                                        Read the guide
                                    </a>
                                </p>
                            </div>
                        )}
                        {sortedKeys.map((apiKey) => {
                            const isPublishable =
                                apiKey.metadata?.keyType === "publishable";
                            const plaintextKey = apiKey.metadata
                                ?.plaintextKey as string | undefined;
                            const appUrl = apiKey.metadata?.appUrl as
                                | string
                                | undefined;
                            const isAppKey = isPublishable && !!appUrl;

                            return (
                                <div
                                    key={apiKey.id}
                                    className="bg-white/80 rounded-xl p-4 transition-colors hover:bg-white/90"
                                >
                                    {/* Row 1: Type, Name, Key, Actions */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span
                                            className={cn(
                                                "px-2 py-0.5 rounded text-xs font-medium shrink-0",
                                                isPublishable
                                                    ? appUrl
                                                        ? "bg-amber-100 text-amber-700"
                                                        : "bg-blue-100 text-blue-700"
                                                    : "bg-purple-100 text-purple-700",
                                            )}
                                        >
                                            {isPublishable
                                                ? appUrl
                                                    ? "🖥️ App"
                                                    : "🌐 Publishable"
                                                : "🔒 Secret"}
                                        </span>
                                        <span
                                            className="text-sm font-medium truncate"
                                            title={apiKey.name ?? undefined}
                                        >
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
                                            <button
                                                type="button"
                                                className="w-6 h-6 flex items-center justify-center rounded bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 transition-colors cursor-pointer"
                                                onClick={() =>
                                                    setEditingKey(apiKey)
                                                }
                                                title="Edit key"
                                            >
                                                ✎
                                            </button>
                                            <button
                                                type="button"
                                                className="w-6 h-6 flex items-center justify-center rounded bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors text-lg cursor-pointer"
                                                onClick={() =>
                                                    setDeleteId(apiKey.id)
                                                }
                                                title="Delete key"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                    {/* Row 2: Stats and Permissions */}
                                    <div className="flex flex-wrap items-center gap-4 text-xs">
                                        <span title="Created">
                                            <span className="text-gray-400">
                                                Created:{" "}
                                            </span>
                                            <span className="text-gray-500">
                                                {formatDistanceToNowStrict(
                                                    apiKey.createdAt,
                                                    {
                                                        addSuffix: false,
                                                        locale: shortLocale,
                                                    },
                                                )}
                                            </span>
                                        </span>
                                        <span title="Last used">
                                            <span className="text-gray-400">
                                                Used:{" "}
                                            </span>
                                            <span className="text-gray-500">
                                                {apiKey.lastRequest
                                                    ? formatDistanceToNowStrict(
                                                          new Date(
                                                              apiKey.lastRequest,
                                                          ),
                                                          {
                                                              addSuffix: false,
                                                              locale: shortLocale,
                                                          },
                                                      )
                                                    : "never"}
                                            </span>
                                        </span>
                                        {isPublishable && appUrl && (
                                            <span title={appUrl}>
                                                <span className="text-gray-400">
                                                    URL:{" "}
                                                </span>
                                                <a
                                                    href={appUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline truncate max-w-[200px] inline-block align-bottom"
                                                >
                                                    {appUrl.replace(
                                                        /^https?:\/\//,
                                                        "",
                                                    )}
                                                </a>
                                            </span>
                                        )}
                                        {!isAppKey && (
                                            <>
                                                <LimitsBadge
                                                    expiresAt={
                                                        apiKey.expiresAt
                                                            ? new Date(
                                                                  apiKey.expiresAt,
                                                              )
                                                            : null
                                                    }
                                                    pollenBudget={
                                                        apiKey.pollenBalance
                                                    }
                                                />
                                                <span className="flex items-center gap-1">
                                                    <span className="text-gray-400">
                                                        Permissions:
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <ModelsBadge
                                                            permissions={
                                                                apiKey.permissions
                                                            }
                                                        />
                                                        <AccountBadge
                                                            permissions={
                                                                apiKey.permissions
                                                            }
                                                        />
                                                    </span>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {apiKeys.some(
                        (k) => k.metadata?.keyType === "publishable",
                    ) && (
                        <p className="text-sm font-medium text-gray-900 mt-3">
                            ⚠️ <strong>Publishable keys</strong> are in beta —
                            for production apps, use secret keys.
                        </p>
                    )}
                </Panel>
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
