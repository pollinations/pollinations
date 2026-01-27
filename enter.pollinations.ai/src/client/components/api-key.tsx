import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { type FormatDistanceToken, formatDistanceToNowStrict } from "date-fns";
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
import { Fragment, useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
import { cn } from "@/util.ts";
import { Button } from "../components/button.tsx";

type ApiKey = {
    id: string;
    name?: string | null;
    start?: string | null;
    createdAt: string;
    lastRequest?: string | null;
    expiresAt?: string | null;
    permissions: { [key: string]: string[] } | null;
    metadata: { [key: string]: unknown } | null;
    pollenBalance?: number | null;
};

type ApiKeyManagerProps = {
    apiKeys: ApiKey[];
    onCreate: (formData: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onDelete: (id: string) => Promise<void>;
};

const Cell: FC<React.ComponentProps<"div">> = ({ children, ...props }) => {
    return (
        <span className="flex items-center" {...props}>
            {children}
        </span>
    );
};

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
        } catch (err) {
            console.error("Failed to copy:", err);
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
    const hasExpiry = expiresAt !== null && expiresAt !== undefined;
    const hasBudget = pollenBudget !== null && pollenBudget !== undefined;

    // Format expiry
    let expiryStr = "∞";
    if (hasExpiry) {
        const expiresDate = new Date(expiresAt);
        const now = new Date();
        const daysLeft = Math.ceil(
            (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysLeft <= 0) {
            expiryStr = "expired";
        } else {
            const timeLeft = formatDistanceToNowStrict(expiresDate, {
                addSuffix: false,
                locale: shortLocale,
            });
            expiryStr = timeLeft;
        }
    }

    // Format budget - show decimals only when needed
    let budgetStr = "∞";
    const isExhausted = hasBudget && pollenBudget <= 0;
    if (hasBudget) {
        const formatted = Number.isInteger(pollenBudget)
            ? pollenBudget.toString()
            : pollenBudget.toFixed(2);
        budgetStr = pollenBudget <= 0 ? "empty" : `${formatted}p`;
    }

    return (
        <div className="flex items-center text-xs whitespace-nowrap">
            <span className="text-gray-600">{expiryStr}</span>
            <span className="text-gray-400 mx-1">/</span>
            <span
                className={
                    isExhausted ? "text-red-500 font-medium" : "text-gray-600"
                }
            >
                {budgetStr}
            </span>
        </div>
    );
};

const ModelsBadge: FC<{
    permissions: { [key: string]: string[] } | null;
}> = ({ permissions }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const models = permissions?.models ?? null;
    const isAllModels = models === null;
    const modelCount = models?.length ?? 0;

    return (
        <button
            type="button"
            className="relative inline-flex items-center"
            onClick={(e) => {
                e.stopPropagation();
                setShowTooltip((prev) => !prev);
            }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setShowTooltip((prev) => !prev);
                }
            }}
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
                        if (el) {
                            const btn = el.parentElement;
                            if (btn) {
                                const rect = btn.getBoundingClientRect();
                                el.style.setProperty(
                                    "--tooltip-top",
                                    `${rect.bottom + 4}px`,
                                );
                                el.style.setProperty(
                                    "--tooltip-left",
                                    `${rect.left}px`,
                                );
                            }
                        }
                    }}
                >
                    {isAllModels ? (
                        "Access to all models"
                    ) : modelCount === 0 ? (
                        "No models allowed"
                    ) : (
                        <div className="font-mono text-[11px] leading-relaxed text-left whitespace-nowrap">
                            {models?.map((model) => (
                                <div key={model}>{model}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </button>
    );
};

export const ApiKeyList: FC<ApiKeyManagerProps> = ({
    apiKeys,
    onCreate,
    onDelete,
}) => {
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const handleDelete = async () => {
        if (deleteId) {
            await onDelete(deleteId);
            setDeleteId(null);
        }
    };

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
                    <div className="bg-blue-50/30 rounded-2xl p-6 border border-blue-300 overflow-hidden">
                        <div
                            className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                            style={{ overflowY: "clip" }}
                        >
                            <div className="grid grid-cols-[auto_auto_auto_auto_auto_auto_auto] gap-x-3 gap-y-2 text-sm min-w-max">
                                <span className="font-bold text-pink-400 text-sm">
                                    Type
                                </span>
                                <span className="font-bold text-pink-400 text-sm">
                                    Name
                                </span>
                                <span className="font-bold text-pink-400 text-sm">
                                    Key
                                </span>
                                <span className="font-bold text-pink-400 text-sm">
                                    Created / Used
                                </span>
                                <span className="font-bold text-pink-400 text-sm">
                                    Expiry / Budget
                                </span>
                                <span className="font-bold text-pink-400 text-sm">
                                    Models
                                </span>
                                <span></span>
                                {[...apiKeys]
                                    .sort(
                                        (a, b) =>
                                            new Date(b.createdAt).getTime() -
                                            new Date(a.createdAt).getTime(),
                                    )
                                    .map((apiKey) => {
                                        const keyType = apiKey.metadata?.[
                                            "keyType"
                                        ] as string | undefined;
                                        const isPublishable =
                                            keyType === "publishable";
                                        const plaintextKey = apiKey.metadata?.[
                                            "plaintextKey"
                                        ] as string | undefined;

                                        return (
                                            <Fragment key={apiKey.id}>
                                                <Cell>
                                                    <span
                                                        className={cn(
                                                            "px-2 py-1 rounded text-xs font-medium",
                                                            isPublishable
                                                                ? "bg-blue-100 text-blue-700"
                                                                : "bg-purple-100 text-purple-700",
                                                        )}
                                                    >
                                                        {isPublishable
                                                            ? "🌐 Publishable"
                                                            : "🔒 Secret"}
                                                    </span>
                                                </Cell>
                                                <Cell>
                                                    <span
                                                        className="text-xs truncate block"
                                                        title={
                                                            apiKey.name ??
                                                            undefined
                                                        }
                                                    >
                                                        {apiKey.name}
                                                    </span>
                                                </Cell>
                                                <Cell>
                                                    {isPublishable &&
                                                    plaintextKey ? (
                                                        <KeyDisplay
                                                            fullKey={
                                                                plaintextKey
                                                            }
                                                            start={
                                                                apiKey.start ??
                                                                ""
                                                            }
                                                        />
                                                    ) : (
                                                        <span className="font-mono text-xs text-gray-500">
                                                            {apiKey.start}...
                                                        </span>
                                                    )}
                                                </Cell>
                                                <Cell>
                                                    <div className="flex items-center text-xs whitespace-nowrap">
                                                        <span className="text-gray-600">
                                                            {formatDistanceToNowStrict(
                                                                apiKey.createdAt,
                                                                {
                                                                    addSuffix: false,
                                                                    locale: shortLocale,
                                                                },
                                                            )}
                                                        </span>
                                                        <span className="text-gray-400 mx-1">
                                                            /
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
                                                                : "—"}
                                                        </span>
                                                    </div>
                                                </Cell>
                                                <Cell>
                                                    <LimitsBadge
                                                        expiresAt={
                                                            apiKey.expiresAt
                                                        }
                                                        pollenBudget={
                                                            apiKey.pollenBalance
                                                        }
                                                    />
                                                </Cell>
                                                <Cell>
                                                    <ModelsBadge
                                                        permissions={
                                                            apiKey.permissions
                                                        }
                                                    />
                                                </Cell>
                                                <Cell>
                                                    <button
                                                        type="button"
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors text-lg cursor-pointer"
                                                        onClick={() =>
                                                            setDeleteId(
                                                                apiKey.id,
                                                            )
                                                        }
                                                        title="Delete key"
                                                    >
                                                        ×
                                                    </button>
                                                </Cell>
                                            </Fragment>
                                        );
                                    })}
                            </div>
                        </div>
                        {apiKeys.some(
                            (k) => k.metadata?.["keyType"] === "publishable",
                        ) && (
                            <div className="bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl p-4 border border-blue-300 mt-4">
                                <p className="text-sm font-medium text-blue-900">
                                    🌐 <strong>Publishable keys:</strong> Beta -
                                    actively improving stability. For production
                                    apps, we recommend secret keys.
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
        setDescription(
            newKeyType === "publishable"
                ? ""
                : `Created on ${new Date().toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}`,
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
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
        } catch (error) {
            console.error("Failed to create API key:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyAndClose = async () => {
        if (createdKey) {
            try {
                await navigator.clipboard.writeText(createdKey.key);
                setCopied(true);
                setTimeout(() => {
                    onComplete();
                    setIsOpen(false);
                }, 500);
            } catch (err) {
                console.error("Failed to copy:", err);
                onComplete();
                setIsOpen(false);
            }
        }
    };

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
                                const noModelsSelected =
                                    Array.isArray(
                                        keyPermissions.permissions
                                            .allowedModels,
                                    ) &&
                                    keyPermissions.permissions.allowedModels
                                        .length === 0;
                                const isDisabled =
                                    !createdKey &&
                                    (!name.trim() ||
                                        isSubmitting ||
                                        noModelsSelected);

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
                                            {copied
                                                ? "✓ Copied! Closing..."
                                                : createdKey
                                                  ? "Copy and Close"
                                                  : isSubmitting
                                                    ? "Creating..."
                                                    : "Create"}
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
