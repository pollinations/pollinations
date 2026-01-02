import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { formatDistanceToNowStrict, type FormatDistanceToken } from "date-fns";

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
import { useState, useEffect } from "react";
import { cn } from "@/util.ts";
import { Button } from "../components/button.tsx";
import { Fragment } from "react";
import {
    uniqueNamesGenerator,
    adjectives,
    animals,
} from "unique-names-generator";
import { ModelPermissions } from "./model-permissions.tsx";

type ApiKey = {
    id: string;
    name?: string | null;
    start?: string | null;
    createdAt: Date;
    lastRequest?: Date | null;
    expiresAt?: Date | null;
    permissions: { [key: string]: string[] } | null;
    metadata: Record<string, string> | null;
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

const ExpirationBadge: FC<{ expiresAt: Date | null | undefined }> = ({
    expiresAt,
}) => {
    if (!expiresAt) {
        return <span className="text-xs text-gray-400">Never</span>;
    }

    const expiresDate = new Date(expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil(
        (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const timeLeft = formatDistanceToNowStrict(expiresDate, {
        addSuffix: false,
        locale: shortLocale,
    });

    if (daysLeft <= 0) {
        return (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">
                Expired
            </span>
        );
    }

    if (daysLeft <= 7) {
        return (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                ⚠️ {timeLeft}
            </span>
        );
    }

    return <span className="text-xs text-gray-600">{timeLeft}</span>;
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
            <span
                className={`${showTooltip ? "visible" : "invisible"} absolute right-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 z-50 pointer-events-none whitespace-normal`}
            >
                {isAllModels ? (
                    "Access to all models"
                ) : modelCount === 0 ? (
                    "No models allowed"
                ) : (
                    <span className="font-mono text-[10px] leading-relaxed">
                        {models?.join(", ")}
                    </span>
                )}
            </span>
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
                            onUpdate={() => {}}
                            onComplete={() => {}}
                        />
                    </div>
                </div>
                {apiKeys.length ? (
                    <div className="bg-blue-50/30 rounded-2xl p-4 sm:p-6 border border-blue-300">
                        <div className="grid grid-cols-[auto_auto_auto_auto_auto_auto_auto] gap-x-2 sm:gap-x-3 gap-y-2 sm:gap-y-3 text-xs sm:text-sm">
                            <span className="font-bold text-pink-400 text-xs">
                                Type
                            </span>
                            <span className="font-bold text-pink-400 text-xs">
                                Name
                            </span>
                            <span className="font-bold text-pink-400 text-xs">
                                Key
                            </span>
                            <span className="font-bold text-pink-400 text-xs">
                                Created / Used
                            </span>
                            <span className="font-bold text-pink-400 text-xs">
                                Expires
                            </span>
                            <span className="font-bold text-pink-400 text-xs">
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
                                                        apiKey.name ?? undefined
                                                    }
                                                >
                                                    {apiKey.name}
                                                </span>
                                            </Cell>
                                            <Cell>
                                                {isPublishable &&
                                                plaintextKey ? (
                                                    <KeyDisplay
                                                        fullKey={plaintextKey}
                                                        start={
                                                            apiKey.start ?? ""
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
                                                <ExpirationBadge
                                                    expiresAt={apiKey.expiresAt}
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
                                                        setDeleteId(apiKey.id)
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
};

export type CreateApiKeyResponse = ApiKey & {
    key: string;
};

type ApiKeyDialogProps = {
    onUpdate: (state: CreateApiKey) => void;
    onSubmit: (state: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onComplete: () => void;
};

const CreateKeyForm: FC<{
    formData: CreateApiKey;
    onInputChange: (
        field: keyof CreateApiKey,
        value: string | string[] | null | undefined,
    ) => void;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    createdKey?: CreateApiKeyResponse | null;
    onComplete?: () => void;
}> = ({
    formData,
    onInputChange,
    onSubmit,
    onCancel,
    isSubmitting,
    createdKey,
    onComplete,
}) => {
    const [copied, setCopied] = useState(false);

    // Reset copied state when modal reopens (createdKey becomes null)
    useEffect(() => {
        if (!createdKey) {
            setCopied(false);
        }
    }, [createdKey]);

    const handleCopyAndClose = async () => {
        if (createdKey) {
            try {
                await navigator.clipboard.writeText(createdKey.key);
                setCopied(true);
                setTimeout(() => {
                    onComplete?.();
                }, 500);
            } catch (err) {
                console.error("Failed to copy:", err);
                onComplete?.();
            }
        }
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <Field.Root>
                <Field.Label className="block text-sm font-medium mb-2">
                    Key Type (*)
                </Field.Label>
                <div className="space-y-2">
                    <label
                        className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                            formData.keyType === "publishable"
                                ? "border-blue-500 bg-blue-50"
                                : "border-gray-200 hover:border-gray-300",
                            createdKey &&
                                formData.keyType !== "publishable" &&
                                "opacity-40",
                        )}
                    >
                        <input
                            type="radio"
                            name="keyType"
                            value="publishable"
                            checked={formData.keyType === "publishable"}
                            onChange={(e) =>
                                onInputChange("keyType", e.target.value)
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
                                    Safe to use in client-side code (React, Vue,
                                    etc.)
                                </li>
                                <li>
                                    Pollen-based rate limiting: 1 pollen/hour
                                    refill per IP+key
                                </li>
                            </ul>
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                                <div className="font-semibold text-amber-900 mb-1">
                                    ⚠️ Beta Feature
                                </div>
                                <ul className="space-y-0.5 list-disc pl-4 text-amber-800">
                                    <li>Still working out some bugs</li>
                                    <li>
                                        For stable production → use secret keys
                                        (no rate limits)
                                    </li>
                                    <li>
                                        Secret keys must be hidden in your
                                        backend
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </label>
                    <label
                        className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                            formData.keyType === "secret"
                                ? "border-purple-500 bg-purple-50"
                                : "border-gray-200 hover:border-gray-300",
                            createdKey &&
                                formData.keyType !== "secret" &&
                                "opacity-40",
                        )}
                    >
                        <input
                            type="radio"
                            name="keyType"
                            value="secret"
                            checked={formData.keyType === "secret"}
                            onChange={(e) =>
                                onInputChange("keyType", e.target.value)
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
                                    For server-side apps - never expose publicly
                                </li>
                                <li>No rate limits</li>
                            </ul>
                        </div>
                    </label>
                </div>
            </Field.Root>

            <Field.Root>
                <Field.Label className="block text-sm font-medium mb-1">
                    {createdKey ? "Your API Key" : "Name (*)"}
                </Field.Label>
                <Field.Input
                    type="text"
                    value={createdKey ? createdKey.key : formData.name}
                    onChange={(e) => onInputChange("name", e.target.value)}
                    className={cn(
                        "w-full px-3 py-2 border rounded",
                        createdKey
                            ? "border-green-300 bg-green-200 font-mono text-xs"
                            : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500",
                    )}
                    placeholder={createdKey ? "" : "Enter API key name"}
                    required={!createdKey}
                    disabled={isSubmitting || !!createdKey}
                    readOnly={!!createdKey}
                />
            </Field.Root>

            {/* Model permissions - collapsible advanced option */}
            {!createdKey && (
                <ModelPermissions
                    value={formData.allowedModels ?? null}
                    onChange={(models) =>
                        onInputChange("allowedModels", models)
                    }
                    disabled={isSubmitting}
                />
            )}
            <div className="flex gap-2 justify-end pt-4">
                {!createdKey && (
                    <Button
                        type="button"
                        weight="outline"
                        onClick={onCancel}
                        className="disabled:opacity-50"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                )}
                {(() => {
                    const noModelsSelected =
                        Array.isArray(formData.allowedModels) &&
                        formData.allowedModels.length === 0;
                    const isDisabled =
                        !createdKey &&
                        (!formData.name.trim() ||
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
                                type={createdKey ? "button" : "submit"}
                                onClick={
                                    createdKey ? handleCopyAndClose : undefined
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
    );
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onUpdate,
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

    const [formData, setFormData] = useState<CreateApiKey>({
        name: generateFunName(),
        description: `Created on ${new Date().toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}`,
        keyType: "secret", // Default to secret key
        allowedModels: null, // null = all models allowed
    });
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
        null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleInputChange = (
        field: keyof CreateApiKey,
        value: string | string[] | null | undefined,
    ) => {
        const updatedData = { ...formData, [field]: value };

        // When key type changes, regenerate name and clear/set description
        if (field === "keyType") {
            updatedData.name = generateFunName();
            updatedData.description =
                value === "publishable"
                    ? ""
                    : `Created on ${new Date().toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}`;
        }

        setFormData(updatedData);
        onUpdate(updatedData);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const newKey = await onSubmit(formData);
            setCreatedKey(newKey);
        } catch (error) {
            console.error("Failed to create API key:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleComplete = () => {
        onComplete();
        setIsOpen(false);
        resetForm();
    };

    const resetForm = () => {
        setCreatedKey(null);
        setFormData({
            name: "backend-" + generateFunName(),
            description: "",
            keyType: "secret",
            allowedModels: null,
        });
    };

    useEffect(() => {
        if (!isOpen) resetForm();
    }, [isOpen]);

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
                    className={
                        "bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
                    }
                >
                    <Dialog.Title className="text-lg font-semibold mb-6">
                        Create New API Key
                    </Dialog.Title>

                    <CreateKeyForm
                        formData={formData}
                        onInputChange={handleInputChange}
                        onSubmit={handleSubmit}
                        onCancel={() => setIsOpen(false)}
                        isSubmitting={isSubmitting}
                        createdKey={createdKey}
                        onComplete={handleComplete}
                    />
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
