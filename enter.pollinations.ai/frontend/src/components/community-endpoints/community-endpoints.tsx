import {
    Button,
    Chip,
    Collapsible,
    CopyButton,
    Field,
    IconButton,
    Input,
    Section,
    Surface,
} from "@pollinations/ui";
import type {
    ChangeEvent,
    ComponentPropsWithoutRef,
    FormEvent,
    ReactNode,
} from "react";
import { useCallback, useEffect, useId, useState } from "react";
import { apiClient } from "../../api.ts";

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    tokenConfigured: boolean;
    promptTextPrice: number;
    completionTextPrice: number;
    contextLength: number | null;
};

type EndpointFormState = {
    name: string;
    description: string;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
    promptTextPrice: string;
    completionTextPrice: string;
};

type ActionState = {
    status: "idle" | "loading" | "success" | "error";
    message?: string;
};

const emptyForm: EndpointFormState = {
    name: "",
    description: "",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    promptTextPrice: "",
    completionTextPrice: "",
};

const idleAction: ActionState = { status: "idle" };
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
        description: endpoint.description ?? "",
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
    const modelName = form.name.trim();
    return {
        name: modelName,
        description: form.description.trim(),
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim() || modelName,
        promptTextPrice: pricePerMillionToPerToken(form.promptTextPrice),
        completionTextPrice: pricePerMillionToPerToken(
            form.completionTextPrice,
        ),
    };
}

function nextFormState(
    current: EndpointFormState,
    key: keyof EndpointFormState,
    value: string,
): EndpointFormState {
    const next = { ...current, [key]: value };
    if (
        key === "upstreamModel" &&
        (!current.name.trim() || current.name === current.upstreamModel)
    ) {
        next.name = value;
    }
    return next;
}

async function readError(response: Response): Promise<string> {
    const fallback = response.statusText || "Request failed";
    try {
        const text = await response.text();
        if (!text) return fallback;
        try {
            const body = JSON.parse(text) as {
                message?: unknown;
                error?: unknown;
            };
            if (typeof body.message === "string") return body.message;
            if (
                body.error &&
                typeof body.error === "object" &&
                "message" in body.error
            ) {
                const detail = validationDetail(body.error);
                return typeof body.error.message === "string"
                    ? [body.error.message, detail].filter(Boolean).join(": ")
                    : detail || fallback;
            }
            if (typeof body.error === "string") return body.error;
        } catch {
            return text;
        }
        return text;
    } catch {
        return fallback;
    }
}

function validationDetail(error: object): string | null {
    if (
        !("details" in error) ||
        !error.details ||
        typeof error.details !== "object"
    ) {
        return null;
    }
    const { fieldErrors } = error.details as {
        fieldErrors?: Record<string, string[]>;
    };
    const [field, messages] = Object.entries(fieldErrors ?? {})[0] ?? [];
    return field && messages?.length
        ? `${field}: ${messages.join(", ")}`
        : null;
}

type CommunityEndpointsProps = {
    onChange?: () => void | Promise<void>;
};

export function CommunityEndpoints({ onChange }: CommunityEndpointsProps) {
    const [endpoints, setEndpoints] = useState<CommunityEndpoint[]>([]);
    const [form, setForm] = useState<EndpointFormState>(emptyForm);
    const [isExpanded, setIsExpanded] = useState(false);
    const [formTest, setFormTest] = useState<ActionState>(idleAction);
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [modelListState, setModelListState] =
        useState<ActionState>(idleAction);
    const [endpointTests, setEndpointTests] = useState<
        Record<string, ActionState>
    >({});
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

    function updateCreateForm(
        key: keyof EndpointFormState,
        value: string,
    ): void {
        setForm((current) => nextFormState(current, key, value));
        setFormTest(idleAction);
        if (key === "baseUrl" || key === "bearerToken") {
            setModelOptions([]);
            setModelListState(idleAction);
        }
    }

    function updateEditForm(key: keyof EndpointFormState, value: string): void {
        setEditForm((current) => nextFormState(current, key, value));
    }

    async function handleFetchModels(): Promise<void> {
        setModelListState({ status: "loading", message: "Fetching models..." });
        try {
            const response = await apiClient[
                "community-endpoints"
            ].models.$post({
                json: {
                    baseUrl: form.baseUrl.trim(),
                    bearerToken: form.bearerToken.trim(),
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            const body = (await response.json()) as { data: string[] };
            setModelOptions(body.data);
            setModelListState({
                status: "success",
                message: `${body.data.length} models loaded`,
            });
        } catch (thrown) {
            setModelOptions([]);
            setModelListState({
                status: "error",
                message:
                    thrown instanceof Error
                        ? thrown.message
                        : "Model list fetch failed",
            });
        }
    }

    async function handleTestForm(): Promise<void> {
        setFormTest({ status: "loading", message: "Testing endpoint..." });
        try {
            const response = await apiClient["community-endpoints"].test.$post({
                json: {
                    baseUrl: form.baseUrl.trim(),
                    bearerToken: form.bearerToken.trim(),
                    model: form.upstreamModel.trim() || form.name.trim(),
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            const body = (await response.json()) as { message?: string };
            setFormTest({
                status: "success",
                message: body.message || "Endpoint responded",
            });
        } catch (thrown) {
            setFormTest({
                status: "error",
                message:
                    thrown instanceof Error
                        ? thrown.message
                        : "Endpoint test failed",
            });
        }
    }

    async function handleTestEndpoint(id: string): Promise<void> {
        setEndpointTests((current) => ({
            ...current,
            [id]: { status: "loading", message: "Testing..." },
        }));
        try {
            const response = await apiClient["community-endpoints"][
                ":id"
            ].test.$post({ param: { id } });
            if (!response.ok) throw new Error(await readError(response));
            const body = (await response.json()) as { message?: string };
            setEndpointTests((current) => ({
                ...current,
                [id]: {
                    status: "success",
                    message: body.message || "Endpoint responded",
                },
            }));
        } catch (thrown) {
            setEndpointTests((current) => ({
                ...current,
                [id]: {
                    status: "error",
                    message:
                        thrown instanceof Error
                            ? thrown.message
                            : "Endpoint test failed",
                },
            }));
        }
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
            setFormTest(idleAction);
            setModelOptions([]);
            setModelListState(idleAction);
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
        <Section title="My models" theme="blue">
            <Collapsible
                expanded={isExpanded}
                onToggle={() => setIsExpanded((value) => !value)}
                ariaLabel="Toggle community models"
                wrapperClassName="border-blue-200 bg-white/70"
                hoverClassName="hover:bg-blue-50"
                panelClassName="border-t border-blue-100 px-3 pb-3 pt-3"
                label={
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-gray-900">
                            Community models
                        </span>
                        <span className="text-xs text-gray-500">
                            {endpoints.length
                                ? `${endpoints.length} registered model${endpoints.length === 1 ? "" : "s"}`
                                : "Register and manage your own OpenAI-compatible endpoints."}
                        </span>
                    </div>
                }
            >
                <div className="flex flex-col gap-4">
                    {error && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </p>
                    )}

                    <EndpointForm
                        form={form}
                        submitLabel={isSaving ? "Saving..." : "Add endpoint"}
                        tokenRequired
                        disabled={isSaving}
                        modelOptions={modelOptions}
                        modelListState={modelListState}
                        testState={formTest}
                        onFetchModels={handleFetchModels}
                        onTest={handleTestForm}
                        onSubmit={handleCreate}
                        onChange={updateCreateForm}
                    />

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
                                            isSaving
                                                ? "Saving..."
                                                : "Save endpoint"
                                        }
                                        disabled={isSaving}
                                        onSubmit={handleUpdate}
                                        onChange={updateEditForm}
                                        onCancel={() => setEditId(null)}
                                    />
                                </Surface>
                            ) : (
                                <EndpointCard
                                    key={endpoint.id}
                                    endpoint={endpoint}
                                    testState={endpointTests[endpoint.id]}
                                    onTest={() =>
                                        void handleTestEndpoint(endpoint.id)
                                    }
                                    onEdit={() => startEdit(endpoint)}
                                    onDelete={() =>
                                        void handleDelete(endpoint.id)
                                    }
                                />
                            ),
                        )
                    )}
                </div>
            </Collapsible>
        </Section>
    );
}

function EndpointForm({
    form,
    submitLabel,
    tokenRequired = false,
    disabled,
    modelOptions = [],
    modelListState = idleAction,
    testState = idleAction,
    onFetchModels,
    onTest,
    onSubmit,
    onChange,
    onCancel,
}: {
    form: EndpointFormState;
    submitLabel: string;
    tokenRequired?: boolean;
    disabled: boolean;
    modelOptions?: string[];
    modelListState?: ActionState;
    testState?: ActionState;
    onFetchModels?: () => void | Promise<void>;
    onTest?: () => void | Promise<void>;
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
                    label="Model ID string"
                    name="community-model-name"
                    value={form.name}
                    placeholder="my-model"
                    helper="Public model id: community/{username}/{model-id}."
                    autoComplete="new-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    onChange={(value) => onChange("name", value)}
                />
                <EndpointField
                    label="Description"
                    name="community-model-description"
                    value={form.description}
                    placeholder="Fast coding model with long context"
                    helper="Shown in the Models list, like registry model descriptions."
                    autoComplete="new-password"
                    maxLength={240}
                    onChange={(value) => onChange("description", value)}
                />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <EndpointField
                    label="Endpoint URL"
                    name="community-endpoint-url"
                    value={form.baseUrl}
                    placeholder="https://api.example.com/v1"
                    helper="Use the OpenAI-compatible /v1 base URL or full chat completions URL."
                    type="url"
                    inputMode="url"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    onChange={(value) => onChange("baseUrl", value)}
                />
                <div className="grid gap-2">
                    <EndpointField
                        label="Provider model ID"
                        name="community-provider-model"
                        value={form.upstreamModel}
                        placeholder="gpt-4o-mini"
                        helper={providerModelHelper(
                            modelOptions,
                            modelListState,
                        )}
                        action={
                            onFetchModels && (
                                <Button
                                    type="button"
                                    size="small"
                                    disabled={
                                        disabled ||
                                        modelListState.status === "loading"
                                    }
                                    onClick={() => void onFetchModels()}
                                >
                                    {modelListState.status === "loading"
                                        ? "Fetching..."
                                        : "Fetch models"}
                                </Button>
                            )
                        }
                        autoComplete="new-password"
                        autoCapitalize="none"
                        spellCheck={false}
                        onChange={(value) => onChange("upstreamModel", value)}
                    />
                    {modelOptions.length > 0 && (
                        <select
                            aria-label="Fetched provider model"
                            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                            value={
                                modelOptions.includes(form.upstreamModel)
                                    ? form.upstreamModel
                                    : ""
                            }
                            onChange={(event) => {
                                if (event.target.value) {
                                    onChange(
                                        "upstreamModel",
                                        event.target.value,
                                    );
                                }
                            }}
                        >
                            <option value="">Select a fetched model...</option>
                            {modelOptions.map((model) => (
                                <option key={model} value={model}>
                                    {model}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>
            <EndpointField
                label={
                    tokenRequired ? "API bearer token" : "New API bearer token"
                }
                name="community-api-bearer-token"
                value={form.bearerToken}
                type="password"
                helper="Stored encrypted and sent as Authorization: Bearer to your endpoint."
                autoComplete="off"
                autoCapitalize="none"
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
                {onTest && (
                    <Button
                        type="button"
                        onClick={() => void onTest()}
                        disabled={disabled || testState.status === "loading"}
                    >
                        {testState.status === "loading"
                            ? "Testing..."
                            : "Test endpoint"}
                    </Button>
                )}
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
            {testState.status !== "idle" && testState.message && (
                <p className={actionMessageClass(testState.status)}>
                    {testState.message}
                </p>
            )}
        </form>
    );
}

function providerModelHelper(
    modelOptions: string[],
    modelListState: ActionState,
): string {
    if (modelListState.status === "loading") return "Fetching /models...";
    if (modelListState.status === "error") {
        return modelListState.message || "Model list fetch failed";
    }
    if (modelListState.status === "success") {
        return `${modelOptions.length} models loaded. Select one or type any model id.`;
    }
    return "Sent as the OpenAI model value. Fetch models or type any model id.";
}

function actionMessageClass(status: ActionState["status"]): string {
    return status === "error"
        ? "text-sm text-red-700"
        : status === "success"
          ? "text-sm text-green-700"
          : "text-sm text-gray-500";
}

function EndpointField({
    label,
    helper,
    action,
    value,
    onChange,
    ...inputProps
}: {
    label: string;
    helper?: ReactNode;
    action?: ReactNode;
    value: string;
    onChange: (value: string) => void;
} & Omit<ComponentPropsWithoutRef<"input">, "onChange" | "value">) {
    const fallbackId = useId();
    const inputId = inputProps.id ?? fallbackId;
    const helperId = helper ? `${inputId}-helper` : undefined;

    return (
        <Field.Root className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <Field.Label htmlFor={inputId} className="text-sm font-medium">
                    {label}
                </Field.Label>
                {action}
            </div>
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
    testState = idleAction,
    onTest,
    onEdit,
    onDelete,
}: {
    endpoint: CommunityEndpoint;
    testState?: ActionState;
    onTest: () => void;
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
                        {testState.status === "success" && (
                            <Chip size="sm" intent="success">
                                Tested
                            </Chip>
                        )}
                        {testState.status === "loading" && (
                            <Chip size="sm" intent="warning">
                                Testing
                            </Chip>
                        )}
                        {testState.status === "error" && (
                            <Chip size="sm" intent="danger">
                                Test failed
                            </Chip>
                        )}
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
                    {endpoint.description && (
                        <p className="mt-2 text-sm text-gray-600">
                            {endpoint.description}
                        </p>
                    )}
                </div>
                <div className="flex gap-1">
                    <Button
                        type="button"
                        size="small"
                        onClick={onTest}
                        disabled={testState.status === "loading"}
                    >
                        Test
                    </Button>
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
                    <span className="text-gray-400">Provider model: </span>
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
            {testState.status === "error" && testState.message && (
                <p className="mt-3 text-sm text-red-700">{testState.message}</p>
            )}
        </Surface>
    );
}
