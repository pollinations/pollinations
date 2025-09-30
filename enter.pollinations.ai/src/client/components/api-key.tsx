import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { Steps } from "@ark-ui/react/steps";
import { formatDistanceToNow, formatRelative } from "date-fns";
import type { FC } from "react";
import { useState, useEffect } from "react";
import { cn } from "@/util.ts";
import { Button } from "../components/button.tsx";
import { Fragment } from "react";

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
            <div className="flex gap-2 justify-between">
                <h2>Api Keys</h2>
                <ApiKeyDialog
                    onSubmit={onCreate}
                    onUpdate={(state) => console.log(state)}
                    onComplete={() => console.log("Dialog completed")}
                />
            </div>
            {apiKeys.length ? (
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr_60px] gap-2">
                    <span className="font-bold">Name</span>
                    <span className="font-bold">Description</span>
                    <span className="font-bold">Start</span>
                    <span className="font-bold">Created</span>
                    <span className="font-bold">Actions</span>
                    {apiKeys.map((apiKey) => (
                        <Fragment key={apiKey.id}>
                            <Cell>{apiKey.name}</Cell>
                            <Cell>
                                {apiKey.metadata?.["description"] || "—"}
                            </Cell>
                            <Cell>{apiKey.start}</Cell>
                            <Cell>
                                {formatRelative(apiKey.createdAt, new Date())}
                            </Cell>
                            <Button
                                type="button"
                                size="small"
                                color="red"
                                weight="light"
                                className="justify-self-end"
                                onClick={() => setDeleteId(apiKey.id)}
                            >
                                Delete
                            </Button>
                        </Fragment>
                    ))}
                </div>
            ) : null}
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
                    Description
                </Field.Label>
                <Field.Textarea
                    value={formData.description || ""}
                    onChange={(e) =>
                        onInputChange("description", e.target.value)
                    }
                    className={cn(
                        "w-full px-3 py-2 border border-gray-300 rounded",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none",
                    )}
                    placeholder="Enter description (optional)"
                    rows={2}
                    disabled={isSubmitting}
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
            <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-4">
                <h3 className="text-sm font-medium text-amber-800">
                    Security Guide
                </h3>
                <ul className="mt-2 text-sm text-amber-800 list-disc pl-3">
                    <li className="font-bold text-amber-900">
                        This is the only time you'll see your API key. <br />{" "}
                        Please copy it now and store it securely.
                    </li>
                    <li>
                        Treat API keys like passwords, never share them
                        publicly.
                    </li>
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
    const [formData, setFormData] = useState<CreateApiKey>({
        name: "",
        description: "",
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
        setFormData({ name: "", description: "" });
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
                <Button as="div">Create API Key</Button>
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
