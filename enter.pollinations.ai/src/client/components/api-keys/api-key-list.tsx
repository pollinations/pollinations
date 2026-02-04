import { formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Card } from "../ui/card.tsx";
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

    const handleDelete = async () => {
        if (deleteId) {
            await onDelete(deleteId);
            setDeleteId(null);
        }
    };

    const sortedKeys = [...apiKeys].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return (
        <>
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                    <h2 className="font-bold flex-1">API Keys</h2>
                    <div className="flex gap-3">
                        <ApiKeyDialog
                            onSubmit={onCreate}
                            onComplete={() => {}}
                        />
                    </div>
                </div>
                {apiKeys.length ? (
                    <Panel color="blue" compact>
                        <div className="flex flex-col gap-3">
                            {sortedKeys.map((apiKey) => {
                                const keyType = apiKey.metadata?.["keyType"] as
                                    | string
                                    | undefined;
                                const isPublishable = keyType === "publishable";
                                const plaintextKey = apiKey.metadata?.[
                                    "plaintextKey"
                                ] as string | undefined;

                                return (
                                    <div
                                        key={apiKey.id}
                                        className="bg-white/40 rounded-xl p-3 transition-colors hover:bg-white/60"
                                    >
                                        {/* Row 1: Type, Name, Key, Actions */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <span
                                                className={cn(
                                                    "px-2 py-0.5 rounded text-xs font-medium shrink-0",
                                                    isPublishable
                                                        ? "bg-blue-100 text-blue-700"
                                                        : "bg-purple-100 text-purple-700",
                                                )}
                                            >
                                                {isPublishable
                                                    ? "🌐 Publishable"
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
                                            <LimitsBadge
                                                expiresAt={apiKey.expiresAt}
                                                pollenBudget={
                                                    apiKey.pollenBalance
                                                }
                                            />
                                            <span className="flex items-center gap-1">
                                                <span className="text-gray-400">
                                                    Models:
                                                </span>
                                                <ModelsBadge
                                                    permissions={
                                                        apiKey.permissions
                                                    }
                                                />
                                            </span>
                                            <AccountBadge
                                                permissions={apiKey.permissions}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {apiKeys.some(
                            (k) => k.metadata?.["keyType"] === "publishable",
                        ) && (
                            <Card color="blue" className="mt-4">
                                <p className="text-sm font-medium text-blue-900">
                                    🌐 <strong>Publishable keys:</strong> Beta -
                                    actively improving stability.
                                </p>
                                <p className="text-sm text-blue-800">
                                    For production apps, we recommend secret
                                    keys.
                                </p>
                            </Card>
                        )}
                    </Panel>
                ) : null}
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
