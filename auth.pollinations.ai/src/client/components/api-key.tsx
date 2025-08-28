import { Dialog } from "@ark-ui/react/dialog";
import { Field } from "@ark-ui/react/field";
import { Steps } from "@ark-ui/react/steps";
import { formatDistanceToNow } from "date-fns";
import type { FC, PropsWithChildren } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Button } from "../components/button.tsx";

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

const Cell: FC<PropsWithChildren> = ({ children }) => {
    return <span className="flex items-center">{children}</span>;
};

export const ApiKeyList: FC<ApiKeyManagerProps> = ({
    apiKeys,
    onCreate,
    onDelete,
}) => {
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
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_60px] gap-2">
                <span className="font-bold">Name</span>
                <span className="font-bold">Description</span>
                <span className="font-bold">Tier</span>
                <span className="font-bold">Start</span>
                <span className="font-bold">Created</span>
                <span className="font-bold">Actions</span>
                {apiKeys.map((apiKey) => (
                    <>
                        <Cell>{apiKey.name}</Cell>
                        <Cell>{apiKey.metadata?.["description"] || ""}</Cell>
                        <Cell>{apiKey.permissions?.["tier"]?.[0] || ""}</Cell>
                        <Cell>{apiKey.start}</Cell>
                        <Cell>
                            {formatDistanceToNow(apiKey.createdAt, {
                                addSuffix: true,
                            })}
                        </Cell>
                        <Button
                            type="button"
                            size="small"
                            variant="outline"
                            className="justify-self-end"
                            onClick={() => onDelete(apiKey.id)}
                        >
                            Delete
                        </Button>
                    </>
                ))}
            </div>
        </>
    );
};

export type CreateApiKey = {
    name: string;
    domains: string[];
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
                    Allowed Domains (*)
                </Field.Label>
                <Field.Textarea
                    value={formData.domains.join("\n") || ""}
                    onChange={(e) =>
                        onInputChange(
                            "domains",
                            e.target.value.split("\n").map((str) => str.trim()),
                        )
                    }
                    className={cn(
                        "w-full px-3 py-2 border border-gray-300 rounded",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none",
                    )}
                    placeholder={"https://example.com\nhttp:localhost:3000"}
                    rows={2}
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
                    variant="outline"
                    onClick={onCancel}
                    className="disabled:opacity-50"
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    variant="default"
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
                        Store your API key in a secure location, like a password
                        manager or environment variables.
                    </li>
                    <li>
                        Never share your API key in public repositories or
                        communications.
                    </li>
                    <li>Rotate your API keys regularly.</li>
                    <li>Delete unused API keys as soon as possible.</li>
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
                        variant="pink"
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
        domains: [],
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
        setIsOpen(false);
        setCurrentStep(0);
        setCreatedKey(null);
        setFormData({ name: "", description: "", domains: [] });
        onComplete();
    };

    const handleCancel = () => {
        setIsOpen(false);
        setCurrentStep(0);
        setCreatedKey(null);
        setFormData({ name: "", description: "", domains: [] });
    };

    const steps = [
        { title: "Create Key", description: "Enter key details" },
        { title: "Save Key", description: "Copy and secure your key" },
    ];

    return (
        <Dialog.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Dialog.Trigger>
                <Button>Create API Key</Button>
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
                                    onCancel={handleCancel}
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
