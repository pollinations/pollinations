import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { type FormatDistanceToken, formatDistanceToNowStrict } from "date-fns";
import { EditApiKeyDialog } from "./edit-api-key-dialog.tsx";
import { KeyPermissionsInputs, useKeyPermissions } from "./key-permissions.tsx";

const shortFormatDistance: Record<FormatDistanceToken, string> = {
    lessThanXSeconds: "{{count}}s",
    xSeconds: "{{count}}s",
    halfAMinute: "30s",
    lessThanXMinutes: "{{count}}m",
    xMinutes: "{{count}}m",
    aboutXHours: "{{count}}h",
    xHours: "{{count}}h",
    xDays: "{{count}}d",
    aboutXWeeks: "{{count}}w",
    xWeeks: "{{count}}w",
    aboutXMonths: "{{count}}mo",
    xMonths: "{{count}}mo",
    aboutXYears: "{{count}}y",
    xYears: "{{count}}y",
    overXYears: "{{count}}y",
    almostXYears: "{{count}}y",
};

const shortLocale = {
    formatDistance: (token: FormatDistanceToken, count: number) =>
        shortFormatDistance[token].replace("{{count}}", String(count)),
};

import type { FC } from "react";
import { useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
import { cn } from "@/util.ts";
import { Button } from "../components/button.tsx";

interface ApiKey {
    id: string;
    name?: string | null;
    start?: string | null;
    enabled?: boolean;
    createdAt: string;
    lastRequest?: string | null;
    expiresAt?: string | null;
    permissions: { [key: string]: string[] } | null;
    metadata: { [key: string]: unknown } | null;
    pollenBalance?: number | null;
}

interface ApiKeyUpdateParams {
    name?: string;
    enabled?: boolean;
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    accountPermissions?: string[] | null;
    expiresAt?: Date | null;
}

interface ApiKeyManagerProps {
    apiKeys: ApiKey[];
    onCreate: (formData: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onUpdate: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const KeyDisplay: FC<{ fullKey: string; start: string }> = ({
    fullKey,
    start,
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(fullKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (_err) {
            // Silently fail
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className={cn(
                "font-mono text-xs text-left cursor-pointer transition-all",
                copied
                    ? "text-green-600 font-semibold"
                    : "text-blue-600 hover:text-blue-800 hover:underline",
            )}
            title={copied ? "Copied!" : "Click to copy full key"}
        >
            {copied ? "✓ Copied!" : `${start}...`}
        </button>
    );
};

const LimitsBadge: FC<{
    expiresAt: Date | null | undefined;
    pollenBudget: number | null | undefined;
}> = ({ expiresAt, pollenBudget }) => {
    const expiryStr = formatExpiry(expiresAt);
    const budgetStr = formatBudget(pollenBudget);
    const isExhausted = pollenBudget != null && pollenBudget <= 0;

    return (
        <div className="flex items-center text-xs whitespace-nowrap">
            <span className="text-gray-600">{expiryStr}</span>
            <span className="text-gray-400 mx-1">/</span>
            <span
                className={cn(
                    "text-gray-600",
                    isExhausted && "text-red-500 font-medium",
                )}
            >
                {budgetStr}
            </span>
        </div>
    );
};

function formatExpiry(expiresAt: Date | null | undefined): string {
    if (!expiresAt) return "∞";

    const expiresDate = new Date(expiresAt);
    const daysLeft = Math.ceil(
        (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    if (daysLeft <= 0) return "expired";

    return formatDistanceToNowStrict(expiresDate, {
        addSuffix: false,
        locale: shortLocale,
    });
}

function formatBudget(pollenBudget: number | null | undefined): string {
    if (pollenBudget == null) return "∞";
    if (pollenBudget <= 0) return "empty";

    return Number.isInteger(pollenBudget)
        ? `${pollenBudget}p`
        : `${pollenBudget.toFixed(2)}p`;
}

const ModelsBadge: FC<{
    permissions: { [key: string]: string[] } | null;
}> = ({ permissions }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const models = permissions?.models ?? null;
    const isAllModels = models === null;
    const modelCount = models?.length ?? 0;

    const handleInteraction = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if ("key" in e && e.key !== "Enter" && e.key !== " ") return;
        if ("key" in e) e.preventDefault();
        setShowTooltip((prev) => !prev);
    };

    const tooltipContent = () => {
        if (isAllModels) return "Access to all models";
        if (modelCount === 0) return "No models allowed";
        return (
            <div className="font-mono text-[11px] leading-relaxed text-left whitespace-nowrap">
                {models?.map((model) => (
                    <div key={model}>{model}</div>
                ))}
            </div>
        );
    };

    return (
        <button
            type="button"
            className="relative inline-flex items-center"
            onClick={handleInteraction}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onKeyDown={handleInteraction}
            aria-label="Show allowed models"
        >
            <span
                className={cn(
                    "text-xs px-2 py-0.5 rounded-full border cursor-pointer transition-colors",
                    isAllModels
                        ? "bg-green-100 text-green-700 border-green-300 hover:bg-green-200"
                        : "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200",
                )}
            >
                {isAllModels ? "All" : modelCount}
            </span>
            {showTooltip && (
                <div
                    className="fixed z-[9999] px-2 py-1.5 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 pointer-events-none"
                    style={{
                        top: "var(--tooltip-top)",
                        left: "var(--tooltip-left)",
                    }}
                    ref={(el) => {
                        if (!el) return;
                        const btn = el.parentElement;
                        if (!btn) return;
                        const rect = btn.getBoundingClientRect();
                        el.style.setProperty(
                            "--tooltip-top",
                            `${rect.bottom + 4}px`,
                        );
                        el.style.setProperty(
                            "--tooltip-left",
                            `${rect.left}px`,
                        );
                    }}
                >
                    {tooltipContent()}
                </div>
            )}
        </button>
    );
};

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
                    <div className="bg-blue-50/30 rounded-2xl p-4 border border-blue-300">
                        <div className="flex flex-col gap-3">
                            {sortedKeys.map((apiKey) => {
                                const keyType = apiKey.metadata?.["keyType"] as
                                    | string
                                    | undefined;
                                const isPublishable = keyType === "publishable";
                                const plaintextKey = apiKey.metadata?.[
                                    "plaintextKey"
                                ] as string | undefined;

                                const isDisabled = apiKey.enabled === false;

                                return (
                                    <div
                                        key={apiKey.id}
                                        className={cn(
                                            "bg-white/40 rounded-xl p-3 transition-colors relative",
                                            !isDisabled && "hover:bg-white/60",
                                        )}
                                    >
                                        {/* Row 1: Type, Name, Key, Actions */}
                                        <div
                                            className={cn(
                                                "flex items-center gap-2 mb-2 pl-12",
                                                isDisabled && "opacity-30",
                                            )}
                                        >
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
                                        {/* Row 2: Created/Used, Expiry/Budget, Models */}
                                        <div
                                            className={cn(
                                                "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500",
                                                isDisabled && "opacity-30",
                                            )}
                                        >
                                            <div className="flex items-center gap-1">
                                                <span className="text-pink-400 font-medium">
                                                    Created/Used:
                                                </span>
                                                <span title="Created">
                                                    {formatDistanceToNowStrict(
                                                        apiKey.createdAt,
                                                        {
                                                            addSuffix: false,
                                                            locale: shortLocale,
                                                        },
                                                    )}
                                                </span>
                                                <span className="text-gray-400">
                                                    /
                                                </span>
                                                <span title="Last used">
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
                                                        : "—"}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-pink-400 font-medium">
                                                    Expiry/Budget:
                                                </span>
                                                <LimitsBadge
                                                    expiresAt={apiKey.expiresAt}
                                                    pollenBudget={
                                                        apiKey.pollenBalance
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <ModelsBadge
                                                    permissions={
                                                        apiKey.permissions
                                                    }
                                                />
                                            </div>
                                        </div>
                                        {/* Toggle button - outside opacity-affected content, on the left */}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onUpdate(apiKey.id, {
                                                    enabled: isDisabled,
                                                })
                                            }
                                            className={cn(
                                                "absolute top-[13px] left-3 inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer border",
                                                isDisabled
                                                    ? "bg-red-50 border-red-200 hover:bg-red-100"
                                                    : "bg-green-100 border-green-300 hover:bg-green-200",
                                            )}
                                            title={
                                                isDisabled
                                                    ? "Enable key"
                                                    : "Disable key"
                                            }
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block h-3.5 w-3.5 transform rounded-full transition-transform",
                                                    isDisabled
                                                        ? "translate-x-1 bg-red-400"
                                                        : "translate-x-[18px] bg-green-600",
                                                )}
                                            />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {apiKeys.some(
                            (k) => k.metadata?.["keyType"] === "publishable",
                        ) && (
                            <div className="bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl p-4 border border-blue-300 mt-4">
                                <p className="text-sm font-medium text-blue-900">
                                    🌐 <strong>Publishable keys:</strong> Beta -
                                    actively improving stability.
                                </p>
                                <p className="text-sm text-blue-800">
                                    For production apps, we recommend secret
                                    keys.
                                </p>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
            <Dialog.Root
                open={!!deleteId}
                onOpenChange={({ open }) => !open && setDeleteId(null)}
            >
                <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
                <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                    <Dialog.Content className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-md w-full p-6">
                        <Dialog.Title className="text-lg font-semibold mb-4">
                            Delete API Key
                        </Dialog.Title>
                        <p className="mb-6">
                            Are you sure you want to delete this API key? This
                            action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <Button
                                type="button"
                                weight="outline"
                                onClick={() => setDeleteId(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                color="red"
                                weight="strong"
                                onClick={handleDelete}
                            >
                                Delete
                            </Button>
                        </div>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Dialog.Root>
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

export type CreateApiKey = {
    name: string;
    description?: string;
    keyType?: "publishable" | "secret";
    /** Model IDs this key can access. null = all models allowed */
    allowedModels?: string[] | null;
    /** Pollen budget cap for this key. null = unlimited */
    pollenBudget?: number | null;
    /** Days until expiry. null = no expiry */
    expiryDays?: number | null;
    /** Account permissions: ["balance", "usage"]. null = no permissions */
    accountPermissions?: string[] | null;
};

export type CreateApiKeyResponse = ApiKey & {
    key: string;
};

type ApiKeyDialogProps = {
    onSubmit: (state: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onComplete: () => void;
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onSubmit,
    onComplete,
}) => {
    // Generate a short fun default name (2 words for brevity)
    const generateFunName = () => {
        return uniqueNamesGenerator({
            dictionaries: [adjectives, animals],
            separator: "-",
            length: 2,
            style: "lowerCase",
        });
    };

    // Form state
    const [name, setName] = useState(generateFunName());
    const [description, setDescription] = useState(
        `Created on ${new Date().toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}`,
    );
    const [keyType, setKeyType] = useState<"secret" | "publishable">("secret");
    const keyPermissions = useKeyPermissions();
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
        null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleKeyTypeChange = (newKeyType: "secret" | "publishable") => {
        setKeyType(newKeyType);
        setName(generateFunName());
        const dateStr = new Date().toLocaleDateString("en-US", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
        setDescription(
            newKeyType === "publishable" ? "" : `Created on ${dateStr}`,
        );
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const newKey = await onSubmit({
                name,
                description,
                keyType,
                ...keyPermissions.permissions,
            });
            setCreatedKey(newKey);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleCopyAndClose() {
        if (!createdKey) return;

        try {
            await navigator.clipboard.writeText(createdKey.key);
            setCopied(true);
            setTimeout(() => {
                onComplete();
                setIsOpen(false);
            }, 500);
        } catch (_err) {
            onComplete();
            setIsOpen(false);
        }
    }

    return (
        <Dialog.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Dialog.Trigger>
                <Button as="div" color="blue" weight="light">
                    Create new key
                </Button>
            </Dialog.Trigger>
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                <Dialog.Content
                    className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
                    style={{
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(156, 163, 175, 0.5) transparent",
                    }}
                >
                    <Dialog.Title className="text-lg font-semibold mb-6">
                        Create New API Key
                    </Dialog.Title>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <Field.Root>
                            <Field.Label className="block text-sm font-semibold mb-2">
                                Type
                            </Field.Label>
                            <div className="space-y-2">
                                <label
                                    className={cn(
                                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                                        keyType === "publishable"
                                            ? "border-blue-500 bg-blue-50"
                                            : "border-gray-200 hover:border-gray-300",
                                        createdKey &&
                                            keyType !== "publishable" &&
                                            "opacity-40",
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="keyType"
                                        value="publishable"
                                        checked={keyType === "publishable"}
                                        onChange={(e) =>
                                            handleKeyTypeChange(
                                                e.target.value as "publishable",
                                            )
                                        }
                                        className="mt-1 w-4 h-4 text-blue-600"
                                        disabled={isSubmitting || !!createdKey}
                                    />
                                    <div className="flex-1">
                                        <div className="font-medium text-blue-800">
                                            🌐 Publishable Key
                                        </div>
                                        <ul className="text-xs text-gray-700 mt-1 space-y-0.5 list-disc pl-4">
                                            <li className="font-semibold">
                                                Always visible in your dashboard
                                            </li>
                                            <li>
                                                Safe to use in client-side code
                                                (React, Vue, etc.)
                                            </li>
                                            <li>
                                                Pollen-based rate limiting: 1
                                                pollen/hour refill per IP+key
                                            </li>
                                        </ul>
                                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                                            <div className="font-semibold text-amber-900 mb-1">
                                                ⚠️ Beta Feature
                                            </div>
                                            <ul className="space-y-0.5 list-disc pl-4 text-amber-800">
                                                <li>
                                                    Still working out some bugs
                                                </li>
                                                <li>
                                                    For stable production → use
                                                    secret keys (no rate limits)
                                                </li>
                                                <li>
                                                    Secret keys must be hidden
                                                    in your backend
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </label>
                                <label
                                    className={cn(
                                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                                        keyType === "secret"
                                            ? "border-purple-500 bg-purple-50"
                                            : "border-gray-200 hover:border-gray-300",
                                        createdKey &&
                                            keyType !== "secret" &&
                                            "opacity-40",
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="keyType"
                                        value="secret"
                                        checked={keyType === "secret"}
                                        onChange={(e) =>
                                            handleKeyTypeChange(
                                                e.target.value as "secret",
                                            )
                                        }
                                        className="mt-1 w-4 h-4 text-purple-600"
                                        disabled={isSubmitting || !!createdKey}
                                    />
                                    <div className="flex-1">
                                        <div className="font-medium text-purple-800">
                                            🔒 Secret Key
                                        </div>
                                        <ul className="text-xs text-gray-700 mt-1 space-y-0.5 list-disc pl-4">
                                            <li className="font-semibold text-amber-900">
                                                Only shown once - copy it now!
                                            </li>
                                            <li>
                                                For server-side apps - never
                                                expose publicly
                                            </li>
                                            <li>No rate limits</li>
                                        </ul>
                                    </div>
                                </label>
                            </div>
                        </Field.Root>

                        <Field.Root>
                            <Field.Label className="block text-sm font-semibold mb-2">
                                {createdKey ? "Your API Key" : "Name"}
                            </Field.Label>
                            <Field.Input
                                type="text"
                                value={createdKey ? createdKey.key : name}
                                onChange={(e) => setName(e.target.value)}
                                className={cn(
                                    "w-full px-3 py-2 border rounded",
                                    createdKey
                                        ? "border-green-300 bg-green-200 font-mono text-xs"
                                        : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500",
                                )}
                                placeholder={
                                    createdKey ? "" : "Enter API key name"
                                }
                                required={!createdKey}
                                disabled={isSubmitting || !!createdKey}
                                readOnly={!!createdKey}
                            />
                        </Field.Root>

                        {!createdKey && (
                            <KeyPermissionsInputs
                                value={keyPermissions}
                                disabled={isSubmitting}
                            />
                        )}
                        <div className="flex gap-2 justify-end pt-4">
                            {!createdKey && (
                                <Button
                                    type="button"
                                    weight="outline"
                                    onClick={() => setIsOpen(false)}
                                    className="disabled:opacity-50"
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                            )}
                            {(() => {
                                const { allowedModels } =
                                    keyPermissions.permissions;
                                const noModelsSelected =
                                    Array.isArray(allowedModels) &&
                                    allowedModels.length === 0;
                                const isDisabled =
                                    !createdKey &&
                                    (!name.trim() ||
                                        isSubmitting ||
                                        noModelsSelected);

                                const buttonText = () => {
                                    if (copied) return "✓ Copied! Closing...";
                                    if (createdKey) return "Copy and Close";
                                    if (isSubmitting) return "Creating...";
                                    return "Create";
                                };

                                return (
                                    <span
                                        title={
                                            noModelsSelected && !createdKey
                                                ? "Select at least one model"
                                                : undefined
                                        }
                                    >
                                        <Button
                                            type={
                                                createdKey ? "button" : "submit"
                                            }
                                            onClick={
                                                createdKey
                                                    ? handleCopyAndClose
                                                    : undefined
                                            }
                                            className="disabled:opacity-50"
                                            disabled={isDisabled}
                                        >
                                            {buttonText()}
                                        </Button>
                                    </span>
                                );
                            })()}
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
