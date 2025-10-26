import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { Steps } from "@ark-ui/react/steps";
import { formatDistanceToNow, formatRelative } from "date-fns";
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
        <div className="flex items-center gap-2">
            <span className="font-mono text-xs truncate max-w-[200px]" title={fullKey}>
                {fullKey}
            </span>
            <button
                type="button"
                onClick={handleCopy}
                className="px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded"
            >
                {copied ? "✓" : "Copy"}
            </button>
        </div>
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
                            onUpdate={(state) => console.log(state)}
                            onComplete={() => console.log("Dialog completed")}
                        />
                    </div>
                </div>
                {apiKeys.length ? (
                    <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300 overflow-x-auto scrollbar-hide">
                        <div className="grid grid-cols-[100px_200px_1fr_120px_150px_80px] gap-x-4 gap-y-4 min-w-[900px]">
                            <span className="font-bold text-pink-400 text-sm">Type</span>
                            <span className="font-bold text-pink-400 text-sm">Name</span>
                            <span className="font-bold text-pink-400 text-sm">Description / Key</span>
                            <span className="font-bold text-pink-400 text-sm">Preview</span>
                            <span className="font-bold text-pink-400 text-sm">Created</span>
                            <span></span>
                            {apiKeys.map((apiKey) => {
                                const keyType = apiKey.metadata?.["keyType"] as string | undefined;
                                const isFrontend = keyType === "frontend";
                                const description = apiKey.metadata?.["description"] as string | undefined;
                                
                                return (
                                    <Fragment key={apiKey.id}>
                                        <Cell>
                                            <span className={cn(
                                                "px-2 py-1 rounded text-xs font-medium",
                                                isFrontend 
                                                    ? "bg-blue-100 text-blue-700" 
                                                    : "bg-purple-100 text-purple-700"
                                            )}>
                                                {isFrontend ? "🌐 Frontend" : "🔒 Server"}
                                            </span>
                                        </Cell>
                                        <Cell>
                                            <span className="font-medium truncate block" title={apiKey.name}>{apiKey.name}</span>
                                        </Cell>
                                        <Cell>
                                            {isFrontend && description ? (
                                                <KeyDisplay fullKey={description} />
                                            ) : (
                                                <span className="text-sm text-gray-600">{description || "—"}</span>
                                            )}
                                        </Cell>
                                        <Cell>
                                            <span className="font-mono text-xs text-gray-500">{apiKey.start}</span>
                                        </Cell>
                                        <Cell>
                                            <span className="text-sm text-gray-600 whitespace-nowrap">
                                                {formatRelative(apiKey.createdAt, new Date())}
                                            </span>
                                        </Cell>
                                        <Button
                                            type="button"
                                            size="small"
                                            weight="light"
                                            className="justify-self-center bg-red-50 text-red-700 hover:bg-red-100"
                                            onClick={() => setDeleteId(apiKey.id)}
                                        >
                                            Delete
                                        </Button>
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
    keyType?: "frontend" | "server";
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
}> = ({ formData, onInputChange, onSubmit, onCancel, isSubmitting }) => {
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <Field.Root>
                <Field.Label className="block text-sm font-medium mb-2">
                    Key Type (*)
                </Field.Label>
                <div className="space-y-2">
                    <label className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                        formData.keyType === "frontend" 
                            ? "border-blue-500 bg-blue-50" 
                            : "border-gray-200 hover:border-gray-300"
                    )}>
                        <input
                            type="radio"
                            name="keyType"
                            value="frontend"
                            checked={formData.keyType === "frontend"}
                            onChange={(e) => onInputChange("keyType", e.target.value)}
                            className="mt-1 w-4 h-4 text-blue-600"
                            disabled={isSubmitting}
                        />
                        <div className="flex-1">
                            <div className="font-medium">🌐 Frontend Key</div>
                            <div className="text-xs text-gray-600">
                                For client-side apps (React, Vue, etc.). Visible in browser. Access to all models with IP-based rate limiting (100 req/min).
                            </div>
                        </div>
                    </label>
                    <label className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                        formData.keyType === "server" 
                            ? "border-purple-500 bg-purple-50" 
                            : "border-gray-200 hover:border-gray-300"
                    )}>
                        <input
                            type="radio"
                            name="keyType"
                            value="server"
                            checked={formData.keyType === "server"}
                            onChange={(e) => onInputChange("keyType", e.target.value)}
                            className="mt-1 w-4 h-4 text-purple-600"
                            disabled={isSubmitting}
                        />
                        <div className="flex-1">
                            <div className="font-medium">🔒 Server Key</div>
                            <div className="text-xs text-gray-600">
                                For server-to-server apps. Never expose publicly. Best rate limits and can spend Pollen on premium models.
                            </div>
                        </div>
                    </label>
                </div>
            </Field.Root>
            <Field.Root>
                <Field.Label className="block text-sm font-medium mb-1">
                    Name (*)
                </Field.Label>
                <Field.Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => onInputChange("name", e.target.value)}
                    className={cn(
                        "w-full px-3 py-2 border border-gray-300 rounded",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500",
                    )}
                    placeholder="Enter API key name"
                    required
                    disabled={isSubmitting}
                />
            </Field.Root>
            <Field.Root>
                <Field.Label className="block text-sm font-medium mb-1">
                    Description {formData.keyType === 'frontend' && <span className="text-xs text-gray-500">(disabled for frontend keys)</span>}
                </Field.Label>
                <Field.Textarea
                    value={formData.description || ""}
                    onChange={(e) =>
                        onInputChange("description", e.target.value)
                    }
                    className={cn(
                        "w-full px-3 py-2 border border-gray-300 rounded",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none",
                        formData.keyType === 'frontend' && "bg-gray-100 cursor-not-allowed"
                    )}
                    placeholder={formData.keyType === 'frontend' ? "Reserved for key" : "Enter description (optional)"}
                    rows={2}
                    disabled={isSubmitting || formData.keyType === 'frontend'}
                />
            </Field.Root>
            <div className="flex gap-2 justify-end pt-4">
                <Button
                    type="button"
                    weight="outline"
                    onClick={onCancel}
                    className="disabled:opacity-50"
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    className="disabled:opacity-50"
                    disabled={!formData.name.trim() || isSubmitting}
                >
                    {isSubmitting ? "Creating..." : "Create"}
                </Button>
            </div>
        </form>
    );
};

const ShowKeyResult: FC<{
    createdKey: CreateApiKeyResponse;
    onComplete: () => void;
}> = ({ createdKey, onComplete }) => {
    const [copied, setCopied] = useState(false);
    const keyType = createdKey.metadata?.["keyType"] as string | undefined;
    const isFrontend = keyType === "frontend";

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(createdKey.key);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    return (
        <div className="space-y-4">
            <div className={cn(
                "border-2 rounded-lg p-4",
                isFrontend 
                    ? "bg-blue-100 border-blue-300" 
                    : "bg-amber-100 border-amber-300"
            )}>
                <h3 className={cn(
                    "text-sm font-medium",
                    isFrontend ? "text-blue-800" : "text-amber-800"
                )}>
                    {isFrontend ? "🌐 Frontend Key Created" : "🔒 Server Key Created"}
                </h3>
                <ul className={cn(
                    "mt-2 text-sm list-disc pl-3",
                    isFrontend ? "text-blue-800" : "text-amber-800"
                )}>
                    {isFrontend ? (
                        <>
                            <li className="font-bold">
                                This key is always visible in your dashboard.
                            </li>
                            <li>
                                Safe to use in client-side code (React, Vue, etc.)
                            </li>
                            <li>
                                Access to all models with IP-based rate limiting
                            </li>
                        </>
                    ) : (
                        <>
                            <li className="font-bold text-amber-900">
                                This is the only time you'll see your API key. <br />
                                Please copy it now and store it securely.
                            </li>
                            <li>
                                Never expose server keys in client-side code
                            </li>
                            <li>
                                Can spend Pollen on premium models
                            </li>
                        </>
                    )}
                </ul>
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="api-key-display"
                    className="block text-sm font-medium text-gray-700"
                >
                    Your API Key
                </label>
                <div className="flex gap-2">
                    <input
                        id="api-key-display"
                        type="text"
                        value={createdKey.key}
                        className={cn(
                            "flex-1 px-3 py-2 border border-green-300 rounded",
                            "bg-green-200 font-mono text-xs",
                        )}
                        readOnly
                    />
                    <Button
                        type="button"
                        color="pink"
                        weight="light"
                        shape="rounded"
                        onClick={handleCopy}
                    >
                        {copied ? "Copied!" : "Copy"}
                    </Button>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <Button type="button" onClick={onComplete}>
                    I've Saved My Key
                </Button>
            </div>
        </div>
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
        name: "backend-" + generateFunName(),
        description: `Created on ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' })}`,
        keyType: "server", // Default to server key
    });
    const [currentStep, setCurrentStep] = useState(0);
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
        
        // When key type changes, regenerate name with appropriate prefix
        if (field === 'keyType') {
            const prefix = value === 'frontend' ? 'frontend-' : 'backend-';
            const baseName = generateFunName();
            updatedData.name = prefix + baseName;
            
            // Clear description for frontend keys, set default for backend
            if (value === 'frontend') {
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
            setCurrentStep(1);
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
        setCurrentStep(0);
        setCreatedKey(null);
        setFormData({ name: "backend-" + generateFunName(), description: "", keyType: "server" });
    };

    useEffect(() => {
        if (!isOpen) resetForm();
    }, [isOpen]);

    const steps = [
        { title: "Create Key", description: "Enter key details" },
        { title: "Save Key", description: "Copy and secure your key" },
    ];

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
                    <Steps.Root
                        count={2}
                        step={currentStep}
                        onStepChange={({ step }) => setCurrentStep(step)}
                    >
                        <div className="flex justify-between">
                            <Dialog.Title className="text-lg font-semibold mb-6">
                                {currentStep === 0
                                    ? "Create New API Key"
                                    : "Your API Key is Ready"}
                            </Dialog.Title>
                            <Steps.List className="flex justify-between gap-2">
                                {steps.map((step, index) => (
                                    <Steps.Item
                                        key={step.title}
                                        index={index}
                                        className="flex-1"
                                    >
                                        <Steps.Indicator
                                            className={cn(
                                                "w-6 h-6 rounded-full flex items-center",
                                                "justify-center text-sm font-medium",
                                                index === currentStep
                                                    ? "bg-green-950 text-green-50"
                                                    : "bg-gray-200 text-gray-600",
                                            )}
                                        >
                                            {index < currentStep
                                                ? ""
                                                : index + 1}
                                        </Steps.Indicator>
                                    </Steps.Item>
                                ))}
                            </Steps.List>
                        </div>

                        <div>
                            <Steps.Content index={0}>
                                <CreateKeyForm
                                    formData={formData}
                                    onInputChange={handleInputChange}
                                    onSubmit={handleSubmit}
                                    onCancel={() => setIsOpen(false)}
                                    isSubmitting={isSubmitting}
                                />
                            </Steps.Content>
                            <Steps.Content index={1}>
                                {createdKey && (
                                    <ShowKeyResult
                                        createdKey={createdKey}
                                        onComplete={handleComplete}
                                    />
                                )}
                            </Steps.Content>
                        </div>
                    </Steps.Root>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};
