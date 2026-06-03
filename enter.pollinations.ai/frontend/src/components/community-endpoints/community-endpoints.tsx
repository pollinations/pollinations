import {
    Button,
    Chip,
    CopyButton,
    Field,
    IconButton,
    Input,
    Section,
    Surface,
} from "@pollinations/ui";
import type { ChangeEvent, ComponentPropsWithoutRef, FormEvent } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import { apiClient } from "../../api.ts";

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    baseUrl: string;
    upstreamModel: string;
    tokenConfigured: boolean;
    promptTextPrice: number;
    completionTextPrice: number;
    contextLength: number | null;
};

type EndpointFormState = {
    name: string;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
    promptTextPrice: string;
    completionTextPrice: string;
};

const emptyForm: EndpointFormState = {
    name: "",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    promptTextPrice: "",
    completionTextPrice: "",
};

const TOKENS_PER_MILLION = 1_000_000;

function pricePerTokenToPerMillion(value: number): string {
    return String(Number((value * TOKENS_PER_MILLION).toPrecision(15)));
}

function pricePerMillionToPerToken(value: string): number {
    return Number(value || 0) / TOKENS_PER_MILLION;
}

function endpointToForm(endpoint: CommunityEndpoint): EndpointFormState {
    return {
        name: endpoint.name,
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
        promptTextPrice: pricePerTokenToPerMillion(endpoint.promptTextPrice),
        completionTextPrice: pricePerTokenToPerMillion(
            endpoint.completionTextPrice,
        ),
    };
}

function toEndpointPayload(form: EndpointFormState) {
    return {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim(),
        promptTextPrice: pricePerMillionToPerToken(form.promptTextPrice),
        completionTextPrice: pricePerMillionToPerToken(
            form.completionTextPrice,
        ),
    };
}

async function readError(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { message?: string };
        return body.message || "Request failed";
    } catch {
        return "Request failed";
    }
}

type CommunityEndpointsProps = {
    onChange?: () => void | Promise<void>;
};

export function CommunityEndpoints({ onChange }: CommunityEndpointsProps) {
    const [endpoints, setEndpoints] = useState<CommunityEndpoint[]>([]);
    const [form, setForm] = useState<EndpointFormState>(emptyForm);
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<EndpointFormState>(emptyForm);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadEndpoints = useCallback(async (): Promise<void> => {
        setError(null);
        const response = await apiClient["community-endpoints"].$get();
        if (!response.ok) {
            setError(await readError(response));
            setIsLoading(false);
            return;
        }
        const body = (await response.json()) as { data: CommunityEndpoint[] };
        setEndpoints(body.data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        void loadEndpoints();
    }, [loadEndpoints]);

    function updateForm(
        setter: (value: EndpointFormState) => void,
        current: EndpointFormState,
        key: keyof EndpointFormState,
        value: string,
    ): void {
        setter({ ...current, [key]: value });
    }

    async function handleCreate(event: FormEvent): Promise<void> {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const response = await apiClient["community-endpoints"].$post({
                json: {
                    ...toEndpointPayload(form),
                    bearerToken: form.bearerToken.trim(),
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            setForm(emptyForm);
            await loadEndpoints();
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Endpoint save failed",
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleUpdate(event: FormEvent): Promise<void> {
        event.preventDefault();
        if (!editId) return;
        setIsSaving(true);
        setError(null);
        try {
            const payload = toEndpointPayload(editForm);
            const response = await apiClient["community-endpoints"][
                ":id"
            ].update.$post({
                param: { id: editId },
                json: editForm.bearerToken.trim()
                    ? { ...payload, bearerToken: editForm.bearerToken.trim() }
                    : payload,
            });
            if (!response.ok) throw new Error(await readError(response));
            setEditId(null);
            await loadEndpoints();
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Endpoint update failed",
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(id: string): Promise<void> {
        setIsSaving(true);
        setError(null);
        try {
            const response = await apiClient["community-endpoints"][
                ":id"
            ].$delete({
                param: { id },
            });
            if (!response.ok) throw new Error(await readError(response));
            await loadEndpoints();
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Endpoint delete failed",
            );
        } finally {
            setIsSaving(false);
        }
    }

    function startEdit(endpoint: CommunityEndpoint): void {
        setEditId(endpoint.id);
        setEditForm(endpointToForm(endpoint));
    }

    return (
        <Section
            title="Endpoints"
            theme="blue"
            framed
            action={<Chip theme="blue">Community</Chip>}
        >
            <div className="flex flex-col gap-4">
                {error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                )}

                <Surface>
                    <EndpointForm
                        form={form}
                        submitLabel={isSaving ? "Saving..." : "Add endpoint"}
                        tokenRequired
                        disabled={isSaving}
                        onSubmit={handleCreate}
                        onChange={(key, value) =>
                            updateForm(setForm, form, key, value)
                        }
                    />
                </Surface>

                {isLoading ? (
                    <Surface className="text-sm text-gray-500">
                        Loading...
                    </Surface>
                ) : endpoints.length === 0 ? (
                    <Surface className="text-sm text-gray-500">
                        No endpoints yet.
                    </Surface>
                ) : (
                    endpoints.map((endpoint) =>
                        editId === endpoint.id ? (
                            <Surface key={endpoint.id}>
                                <EndpointForm
                                    form={editForm}
                                    submitLabel={
                                        isSaving ? "Saving..." : "Save endpoint"
                                    }
                                    disabled={isSaving}
                                    onSubmit={handleUpdate}
                                    onChange={(key, value) =>
                                        updateForm(
                                            setEditForm,
                                            editForm,
                                            key,
                                            value,
                                        )
                                    }
                                    onCancel={() => setEditId(null)}
                                />
                            </Surface>
                        ) : (
                            <EndpointCard
                                key={endpoint.id}
                                endpoint={endpoint}
                                onEdit={() => startEdit(endpoint)}
                                onDelete={() => void handleDelete(endpoint.id)}
                            />
                        ),
                    )
                )}
            </div>
        </Section>
    );
}

function EndpointForm({
    form,
    submitLabel,
    tokenRequired = false,
    disabled,
    onSubmit,
    onChange,
    onCancel,
}: {
    form: EndpointFormState;
    submitLabel: string;
    tokenRequired?: boolean;
    disabled: boolean;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
    onChange: (key: keyof EndpointFormState, value: string) => void;
    onCancel?: () => void;
}) {
    return (
        <form
            className="grid gap-3"
            onSubmit={onSubmit}
            autoComplete="off"
            data-form-type="other"
        >
            <div className="grid gap-3 md:grid-cols-2">
                <EndpointField
                    label="Public model name"
                    name="community-model-name"
                    value={form.name}
                    placeholder="my-model"
                    helper="Used as the last segment of community/{username}/{model-name}."
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    onChange={(value) => onChange("name", value)}
                />
                <EndpointField
                    label="Provider model"
                    name="community-provider-model"
                    value={form.upstreamModel}
                    placeholder="provider-model-name"
                    helper="Sent to your endpoint as the OpenAI model value."
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    onChange={(value) => onChange("upstreamModel", value)}
                />
            </div>
            <EndpointField
                label="Endpoint URL"
                name="community-endpoint-url"
                value={form.baseUrl}
                placeholder="https://api.example.com/v1"
                helper="Use the OpenAI-compatible /v1 base URL or full chat completions URL."
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                onChange={(value) => onChange("baseUrl", value)}
            />
            <EndpointField
                label={
                    tokenRequired ? "API bearer token" : "New API bearer token"
                }
                name="community-api-bearer-token"
                value={form.bearerToken}
                type="password"
                helper="Stored encrypted and sent as Authorization: Bearer to your endpoint."
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                required={tokenRequired}
                onChange={(value) => onChange("bearerToken", value)}
            />
            <div className="grid gap-3 md:grid-cols-2">
                <EndpointField
                    label="Prompt price (Pollen per 1M tokens)"
                    name="community-prompt-price"
                    value={form.promptTextPrice}
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.10"
                    helper="Decimals are allowed, e.g. 0.10 Pollen per million input tokens."
                    autoComplete="off"
                    required
                    onChange={(value) => onChange("promptTextPrice", value)}
                />
                <EndpointField
                    label="Completion price (Pollen per 1M tokens)"
                    name="community-completion-price"
                    value={form.completionTextPrice}
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    placeholder="1.00"
                    helper="Decimals are allowed, e.g. 1.25 Pollen per million output tokens."
                    autoComplete="off"
                    required
                    onChange={(value) => onChange("completionTextPrice", value)}
                />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
                {onCancel && (
                    <Button
                        type="button"
                        onClick={onCancel}
                        disabled={disabled}
                    >
                        Cancel
                    </Button>
                )}
                <Button type="submit" disabled={disabled}>
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}

function EndpointField({
    label,
    helper,
    value,
    onChange,
    ...inputProps
}: {
    label: string;
    helper?: string;
    value: string;
    onChange: (value: string) => void;
} & Omit<ComponentPropsWithoutRef<"input">, "onChange" | "value">) {
    const fallbackId = useId();
    const inputId = inputProps.id ?? fallbackId;
    const helperId = helper ? `${inputId}-helper` : undefined;

    return (
        <Field.Root className="flex flex-col gap-1.5">
            <Field.Label htmlFor={inputId} className="text-sm font-medium">
                {label}
            </Field.Label>
            <Input
                {...inputProps}
                id={inputId}
                aria-describedby={helperId}
                value={value}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(event.target.value)
                }
                className="w-full border-blue-200 bg-blue-50 focus:outline-none focus-visible:border-blue-300 focus-visible:ring-1 focus-visible:ring-blue-200"
            />
            {helper && (
                <p id={helperId} className="text-xs leading-5 text-gray-500">
                    {helper}
                </p>
            )}
        </Field.Root>
    );
}

function EndpointCard({
    endpoint,
    onEdit,
    onDelete,
}: {
    endpoint: CommunityEndpoint;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <Surface className="transition-colors hover:bg-white/90">
            <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">
                            {endpoint.name}
                        </span>
                        <Chip size="sm" theme="blue">
                            {endpoint.tokenConfigured
                                ? "Token set"
                                : "No token"}
                        </Chip>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                            {endpoint.modelId}
                        </code>
                        <CopyButton
                            value={endpoint.modelId}
                            tooltip="Copy model id"
                            copiedTooltip="Copied"
                            className="inline-flex items-center justify-center rounded-full bg-theme-bg-active px-2 pb-1 pt-0.5 text-sm font-medium leading-normal text-theme-text-base transition-colors hover:bg-theme-bg-hover hover:brightness-105"
                        >
                            {(copied: boolean) => (copied ? "Copied" : "Copy")}
                        </CopyButton>
                    </div>
                </div>
                <div className="flex gap-1">
                    <IconButton title="Edit endpoint" onClick={onEdit}>
                        ✎
                    </IconButton>
                    <IconButton
                        intent="danger"
                        title="Delete endpoint"
                        onClick={onDelete}
                        className="text-lg"
                    >
                        ×
                    </IconButton>
                </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-gray-500 md:grid-cols-2">
                <span className="min-w-0 truncate">
                    <span className="text-gray-400">Base: </span>
                    {endpoint.baseUrl}
                </span>
                <span className="min-w-0 truncate">
                    <span className="text-gray-400">Model: </span>
                    {endpoint.upstreamModel}
                </span>
                <span>
                    <span className="text-gray-400">Prompt: </span>
                    {pricePerTokenToPerMillion(endpoint.promptTextPrice)}{" "}
                    pollen/M
                </span>
                <span>
                    <span className="text-gray-400">Completion: </span>
                    {pricePerTokenToPerMillion(endpoint.completionTextPrice)}{" "}
                    pollen/M
                </span>
            </div>
        </Surface>
    );
}
