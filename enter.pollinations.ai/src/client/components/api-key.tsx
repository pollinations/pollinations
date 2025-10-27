import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { useState, useEffect } from "react";
import { cn } from "@/util.ts";
import { Button } from "../components/button.tsx";
import { Fragment } from "react";
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';

type ApiKey = {
    id: string;
    name?: string | null;
    start?: string | null;
    createdAt: Date;
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

const KeyDisplay: FC<{ fullKey: string }> = ({ fullKey }) => {
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
                "font-mono text-xs truncate max-w-[150px] text-left cursor-pointer transition-all",
                copied 
                    ? "text-green-600 font-semibold" 
                    : "text-blue-600 hover:text-blue-800 hover:underline"
            )}
            title={copied ? "Copied!" : "Click to copy"}
        >
            {copied ? "✓ Copied!" : fullKey}
        </button>
    );
};

export const ApiKeyList: FC<ApiKeyManagerProps> = ({
    apiKeys,
    onCreate,
    onDelete,
}) => {
    const [deleteId, setDeleteId] = useState<string | null>(null);
    
    // Sort by creation date, newest first
    const sortedApiKeys = [...apiKeys].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

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
                    <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300 overflow-x-auto">
                        <div className="grid grid-cols-[100px_200px_1fr_70px_40px] gap-x-4 gap-y-4 min-w-[630px]">
                            <span className="font-bold text-pink-400 text-sm">Type</span>
                            <span className="font-bold text-pink-400 text-sm">Name</span>
                            <span className="font-bold text-pink-400 text-sm">Key</span>
                            <span className="font-bold text-pink-400 text-sm">Created</span>
                            <span></span>
                            {sortedApiKeys.map((apiKey) => {
                                const keyType = apiKey.metadata?.["keyType"] as string | undefined;
                                const isPublishable = keyType === "publishable";
                                const plaintextKey = apiKey.metadata?.["plaintextKey"] as string | undefined;
                                
                                return (
                                    <Fragment key={apiKey.id}>
                                        <Cell>
                                            <span className={cn(
                                                "px-2 py-1 rounded text-xs font-medium",
                                                isPublishable 
                                                    ? "bg-blue-100 text-blue-700" 
                                                    : "bg-purple-100 text-purple-700"
                                            )}>
                                                {isPublishable ? "🌐 Publishable" : "🔒 Secret"}
                                            </span>
                                        </Cell>
                                        <Cell>
                                            <span className="text-xs truncate block" title={apiKey.name ?? undefined}>{apiKey.name}</span>
                                        </Cell>
                                        <Cell>
                                            {isPublishable && plaintextKey ? (
                                                <KeyDisplay fullKey={plaintextKey} />
                                            ) : (
                                                <span className="font-mono text-xs text-gray-500">{apiKey.start}...</span>
                                            )}
                                        </Cell>
                                        <Cell>
                                            <span className="text-xs text-gray-600 whitespace-nowrap">
                                                {formatDistanceToNowStrict(apiKey.createdAt, { addSuffix: false })}
                                            </span>
                                        </Cell>
                                        <Cell>
                                            <button
                                                type="button"
                                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors text-lg cursor-pointer"
                                                onClick={() => setDeleteId(apiKey.id)}
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
                ) : null}
            </div>
            <Dialog.Root open={!!deleteId} onOpenChange={({ open }) => !open && setDeleteId(null)}>
                <Dialog.Backdrop className="fixed inset-0 bg-green-950/50" />
                <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Content className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-md w-full p-6">
                        <Dialog.Title className="text-lg font-semibold mb-4">
                            Delete API Key
                        </Dialog.Title>
                        <p className="mb-6">
                            Are you sure you want to delete this API key? This action cannot be undone.
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
        value: string | string[],
    ) => void;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    createdKey?: CreateApiKeyResponse | null;
    onComplete?: () => void;
}> = ({ formData, onInputChange, onSubmit, onCancel, isSubmitting, createdKey, onComplete }) => {
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
                    <label className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                        formData.keyType === "publishable" 
                            ? "border-blue-500 bg-blue-50" 
                            : "border-gray-200 hover:border-gray-300",
                        createdKey && formData.keyType !== "publishable" && "opacity-40"
                    )}>
                        <input
                            type="radio"
                            name="keyType"
                            value="publishable"
                            checked={formData.keyType === "publishable"}
                            onChange={(e) => onInputChange("keyType", e.target.value)}
                            className="mt-1 w-4 h-4 text-blue-600"
                            disabled={isSubmitting || !!createdKey}
                        />
                        <div className="flex-1">
                            <div className="font-medium text-blue-800">🌐 Publishable Key</div>
                            <ul className="text-xs text-gray-700 mt-1 space-y-0.5 list-disc pl-4">
                                <li className="font-semibold">Always visible in your dashboard</li>
                                <li>Safe to use in client-side code (React, Vue, etc.)</li>
                                <li>Access to all models with IP-based rate limiting (100 req/min)</li>
                            </ul>
                        </div>
                    </label>
                    <label className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                        formData.keyType === "secret" 
                            ? "border-purple-500 bg-purple-50" 
                            : "border-gray-200 hover:border-gray-300",
                        createdKey && formData.keyType !== "secret" && "opacity-40"
                    )}>
                        <input
                            type="radio"
                            name="keyType"
                            value="secret"
                            checked={formData.keyType === "secret"}
                            onChange={(e) => onInputChange("keyType", e.target.value)}
                            className="mt-1 w-4 h-4 text-purple-600"
                            disabled={isSubmitting || !!createdKey}
                        />
                        <div className="flex-1">
                            <div className="font-medium text-purple-800">🔒 Secret Key</div>
                            <ul className="text-xs text-gray-700 mt-1 space-y-0.5 list-disc pl-4">
                                <li className="font-semibold text-amber-900">Only shown once - copy it now!</li>
                                <li>For server-side apps - never expose publicly</li>
                                <li>Best rate limits and can spend Pollen for paid models</li>
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
                <Button
                    type={createdKey ? "button" : "submit"}
                    onClick={createdKey ? handleCopyAndClose : undefined}
                    className="disabled:opacity-50"
                    disabled={!createdKey && (!formData.name.trim() || isSubmitting)}
                >
                    {copied ? "✓ Copied! Closing..." : createdKey ? "Copy and Close" : isSubmitting ? "Creating..." : "Create"}
                </Button>
            </div>
        </form>
    );
};

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onUpdate,
    onSubmit,
    onComplete,
}) => {
    // Generate a fun default name
    const generateFunName = () => {
        return uniqueNamesGenerator({
            dictionaries: [adjectives, colors, animals],
            separator: '-',
            length: 3,
            style: 'lowerCase'
        });
    };

    const [formData, setFormData] = useState<CreateApiKey>({
        name: generateFunName(),
        description: `Created on ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' })}`,
        keyType: "secret", // Default to secret key
    });
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
        null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleInputChange = (
        field: keyof CreateApiKey,
        value: string | string[],
    ) => {
        const updatedData = { ...formData, [field]: value };
        
        // When key type changes, regenerate name
        if (field === 'keyType') {
            updatedData.name = generateFunName();
            
            // Clear description for publishable keys, set default for secret
            if (value === 'publishable') {
                updatedData.description = '';
            } else {
                updatedData.description = `Created on ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
            }
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
        setFormData({ name: "backend-" + generateFunName(), description: "", keyType: "secret" });
    };

    useEffect(() => {
        if (!isOpen) resetForm();
    }, [isOpen]);

    return (
        <Dialog.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Dialog.Trigger>
                <Button as="div" color="blue" weight="light">Create new key</Button>
            </Dialog.Trigger>
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Content
                    className={
                        "bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-lg w-full p-6"
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
