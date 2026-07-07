import {
    Alert,
    Button,
    ChevronIcon,
    cn,
    Dialog,
    DialogTitle,
    Dropdown,
    DropdownItem,
    FieldStack,
    IconButton,
    Input,
    ScrollArea,
    Textarea,
    XIcon,
} from "@pollinations/ui";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointKind,
    type CommunityEndpointVisibility,
} from "@shared/community-endpoints.ts";
import { COMMUNITY_TOOL_NAME_PATTERN } from "@shared/registry/community-billing.ts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    formWithVisiblePrices,
    hasPositivePriceInput,
    hasValidVisibleFormPrices,
    PriceGroups,
    REQUIRED_SHARED_PRICE_KEYS,
    returnedPriceFields,
    savedEndpointPriceKeys,
    visiblePriceFieldKeys,
} from "./price-table.tsx";
import {
    type ActionState,
    type CommunityEndpoint,
    type CommunityEndpointTestResponse,
    type EndpointFormState,
    type EndpointMode,
    type EndpointPayload,
    emptyForm,
    endpointToForm,
    idleAction,
    MCP_SERVER_NAME_PATTERN,
    type McpServerRow,
    nextFormState,
    PROMPT_AGENT_BUILTIN_TOOLS,
    type PromptAgentBuiltinTool,
    providerModelHelper,
    readError,
    type ToolFeeRow,
    toEndpointPayload,
} from "./types.ts";

const CAPABILITY_TOGGLES = [
    { key: "tools", label: "Tools" },
    { key: "search", label: "Web search" },
    { key: "reasoning", label: "Reasoning" },
] as const;

const BUILTIN_TOOL_LABELS: Record<PromptAgentBuiltinTool, string> = {
    web_search: "Web search",
    image: "Image",
};

function isValidMcpRow(row: McpServerRow): boolean {
    const name = row.name.trim();
    const url = row.url.trim();
    // Fully-empty rows are dropped on submit, so treat them as valid here.
    if (!name && !url && !row.auth.trim()) return true;
    try {
        new URL(url);
    } catch {
        return false;
    }
    return MCP_SERVER_NAME_PATTERN.test(name);
}

function isValidToolFeeRow(row: ToolFeeRow): boolean {
    const price = Number(row.price.trim());
    return (
        COMMUNITY_TOOL_NAME_PATTERN.test(row.name.trim()) &&
        Number.isFinite(price) &&
        price > 0
    );
}

function ToggleButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Button
            type="button"
            size="sm"
            intent={active ? "info" : undefined}
            aria-pressed={active}
            className={cn("text-sm", !active && "opacity-70")}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

type CommunityEndpointDialogProps = {
    /** Present in edit mode (prefills the form); omit to create. */
    endpoint?: CommunityEndpoint;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (payload: EndpointPayload, bearerToken: string) => Promise<void>;
    /**
     * Allowlisted owners may make a model public (reveals the Visibility control
     * and pricing). Everyone else can only manage private, owner-only models.
     */
    canPublish: boolean;
    /** Create-mode trigger rendered by the parent (e.g. the Section action). */
    trigger?: ReactNode;
};

export function CommunityEndpointDialog({
    endpoint,
    open,
    onOpenChange,
    onSubmit,
    canPublish,
    trigger,
}: CommunityEndpointDialogProps) {
    const isEdit = !!endpoint;
    const [form, setForm] = useState<EndpointFormState>(emptyForm);
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [modelListState, setModelListState] =
        useState<ActionState>(idleAction);
    const [providerModelMenuOpen, setProviderModelMenuOpen] = useState(false);
    const [testState, setTestState] = useState<ActionState>(idleAction);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const savedPriceKeys = savedEndpointPriceKeys(endpoint);

    // Reset the form on open and clear local state on close so unsaved values
    // never survive a dismissed dialog.
    useEffect(() => {
        setForm(open && endpoint ? endpointToForm(endpoint) : emptyForm);
        setModelOptions([]);
        setModelListState(idleAction);
        setProviderModelMenuOpen(false);
        setTestState(idleAction);
        setError(null);
        setIsSubmitting(false);
    }, [open, endpoint]);

    const hasToken = form.bearerToken.trim().length > 0;
    const tokenForRequest = { bearerToken: form.bearerToken.trim() };

    function updateKind(kind: CommunityEndpointKind): void {
        setForm((current) => ({ ...current, kind }));
    }

    function updateVisibility(visibility: CommunityEndpointVisibility): void {
        setForm((current) => ({ ...current, visibility }));
        setError(null);
    }

    // Switching to prompt-agent mode defaults the kind to agent (a no-code
    // agent is an agent); switching back to external restores the model default.
    function updateMode(mode: EndpointMode): void {
        setForm((current) => ({
            ...current,
            mode,
            kind: mode === "prompt-agent" ? "agent" : "model",
        }));
        setTestState(idleAction);
        setError(null);
    }

    function toggleBuiltinTool(tool: PromptAgentBuiltinTool): void {
        setForm((current) => ({
            ...current,
            builtinTools: current.builtinTools.includes(tool)
                ? current.builtinTools.filter((t) => t !== tool)
                : [...current.builtinTools, tool],
        }));
    }

    function updateMcpServer(
        index: number,
        key: keyof McpServerRow,
        value: string,
    ): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.map((row, i) =>
                i === index ? { ...row, [key]: value } : row,
            ),
        }));
    }

    function addMcpServer(): void {
        setForm((current) => ({
            ...current,
            mcpServers: [
                ...current.mcpServers,
                { name: "", url: "", auth: "" },
            ],
        }));
    }

    function removeMcpServer(index: number): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.filter((_, i) => i !== index),
        }));
    }

    function toggleCapability(key: "tools" | "search" | "reasoning"): void {
        setForm((current) => ({ ...current, [key]: !current[key] }));
    }

    function updateToolFee(
        index: number,
        key: keyof ToolFeeRow,
        value: string,
    ): void {
        setForm((current) => ({
            ...current,
            toolFees: current.toolFees.map((row, i) =>
                i === index ? { ...row, [key]: value } : row,
            ),
        }));
    }

    function addToolFee(): void {
        setForm((current) => ({
            ...current,
            toolFees: [...current.toolFees, { name: "", price: "" }],
        }));
    }

    function removeToolFee(index: number): void {
        setForm((current) => ({
            ...current,
            toolFees: current.toolFees.filter((_, i) => i !== index),
        }));
    }

    function updateForm(key: keyof EndpointFormState, value: string): void {
        setForm((current) => nextFormState(current, key, value));
        if (
            key === "name" ||
            key === "upstreamModel" ||
            key === "baseUrl" ||
            key === "bearerToken"
        ) {
            setTestState(idleAction);
        }
        if (key === "baseUrl" || key === "bearerToken") {
            setModelOptions([]);
            setModelListState(idleAction);
            setProviderModelMenuOpen(false);
        }
        if (key === "upstreamModel" && modelOptions.length > 0) {
            setProviderModelMenuOpen(true);
        }
    }

    async function handleFetchModels(): Promise<void> {
        setModelListState({ status: "loading", message: "Fetching models…" });
        try {
            const response = await apiClient.account["my-models"].models.$post({
                json: {
                    baseUrl: form.baseUrl.trim(),
                    ...tokenForRequest,
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            const body = (await response.json()) as { data: string[] };
            setModelOptions(body.data);
            setProviderModelMenuOpen(body.data.length > 0);
            setModelListState({
                status: "success",
                message: `${body.data.length} models loaded`,
            });
        } catch (thrown) {
            setModelOptions([]);
            setProviderModelMenuOpen(false);
            setModelListState({
                status: "error",
                message:
                    thrown instanceof Error
                        ? thrown.message
                        : "Model list fetch failed",
            });
        }
    }

    async function handleTest(): Promise<void> {
        setTestState({ status: "loading", message: "Testing endpoint…" });
        try {
            const response = await apiClient.account["my-models"].test.$post({
                json: {
                    baseUrl: form.baseUrl.trim(),
                    bearerToken: form.bearerToken.trim(),
                    model: form.upstreamModel.trim() || form.name.trim(),
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            const body =
                (await response.json()) as CommunityEndpointTestResponse;
            const returnedFields = returnedPriceFields({
                status: "success",
                usage: body.usage,
                billableUsage: body.billableUsage,
            });
            if (returnedFields.length === 0) {
                throw new Error(
                    "Endpoint responded, but did not return billable token usage",
                );
            }
            setTestState({
                status: "success",
                message: body.message || "Endpoint responded",
                usage: body.usage,
                billableUsage: body.billableUsage,
            });
        } catch (thrown) {
            setTestState({
                status: "error",
                message:
                    thrown instanceof Error
                        ? thrown.message
                        : "Endpoint test failed",
            });
        }
    }

    async function handleSubmit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            await onSubmit(
                toEndpointPayload(
                    formWithVisiblePrices(form, visiblePriceKeys),
                ),
                form.bearerToken.trim(),
            );
            onOpenChange(false);
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Endpoint save failed",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const isPromptAgent = form.mode === "prompt-agent";
    const isSource = form.mode === "source";
    // Pricing is only meaningful when the model is (or is being made) public —
    // keyed off the LIVE form value so flipping Visibility to Public in place
    // reveals the test + pricing section immediately. Private models carry no
    // pricing (owner is the only caller).
    const isShared = form.visibility === "public";
    const returnedFields = isShared ? returnedPriceFields(testState) : [];
    // Reveal the base text fields (always billed, and required to publish), plus
    // whatever the test observed or the model already had saved.
    const visiblePriceKeys = new Set(
        isShared
            ? visiblePriceFieldKeys(savedPriceKeys, returnedFields, [
                  ...REQUIRED_SHARED_PRICE_KEYS,
              ])
            : [],
    );
    const hasValidVisiblePrices = hasValidVisibleFormPrices(
        form,
        visiblePriceKeys,
    );
    // A public model must price the always-billed base text fields (public
    // callers are never billed zero) plus every bucket a test observed.
    const hasRequiredSharedPrices =
        !isShared ||
        [...REQUIRED_SHARED_PRICE_KEYS, ...returnedFields.map((f) => f.key)]
            .map((key) =>
                COMMUNITY_ENDPOINT_PRICE_FIELDS.find((f) => f.key === key),
            )
            .every(
                (field) => field != null && hasPositivePriceInput(form, field),
            );
    // First-time publishing of an external endpoint re-observes its billed
    // buckets, so it needs a successful test. A model already saved as public
    // has server-validated pricing, so re-editing it (e.g. a price or
    // description tweak) does not force another test. Source/prompt-agent have
    // no external endpoint to test; private models defer pricing entirely.
    // External endpoints always need a token to be callable at all.
    const alreadyPublic = isEdit && endpoint.visibility === "public";
    const needsTest = isShared && form.mode === "external" && !alreadyPublic;
    const testRequirementMet =
        testState.status === "success" && returnedFields.length > 0;
    const saveRequirementMet = needsTest
        ? testRequirementMet && (isEdit || hasToken)
        : isEdit || hasToken;
    const providerModelQuery = form.upstreamModel.trim().toLowerCase();
    const visibleModelOptions =
        providerModelQuery === ""
            ? modelOptions
            : modelOptions.filter((model) =>
                  model.toLowerCase().includes(providerModelQuery),
              );
    const hasValidToolFees = form.toolFees.every(isValidToolFeeRow);
    const hasValidMcpServers = form.mcpServers.every(isValidMcpRow);
    // Each mechanism gates differently: external keeps its baseUrl + test +
    // token requirement; source needs worker code; prompt agent validates its
    // no-code config.
    const sourceWithinLimit =
        new TextEncoder().encode(form.source).length <= MAX_SOURCE_BYTES;
    const modeRequirementsMet = isPromptAgent
        ? form.systemPrompt.trim() !== "" &&
          form.baseModel.trim() !== "" &&
          hasValidMcpServers
        : isSource
          ? form.source.trim() !== "" && sourceWithinLimit
          : form.baseUrl.trim() !== "" && saveRequirementMet;
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        hasValidVisiblePrices &&
        hasRequiredSharedPrices &&
        hasValidToolFees &&
        modeRequirementsMet;

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            size="lg"
            trigger={trigger}
            triggerAsChild
            contentClassName="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
            <div className="shrink-0 p-6 pb-4">
                <DialogTitle className="text-lg font-semibold">
                    {isEdit ? "Edit Model" : "Add Model"}
                </DialogTitle>
                <p className="mt-1 text-sm text-theme-text-muted">
                    {isPromptAgent ? (
                        <>
                            Deploy a no-code agent — a system prompt over a base
                            model, with optional built-in tools and MCP servers
                            — as a{" "}
                            <code>
                                {"{username}"}/{"{model-id}"}
                            </code>{" "}
                            model. Pollinations hosts and runs it.
                        </>
                    ) : isSource ? (
                        <>
                            Upload a single-file worker; Pollinations deploys
                            and hosts it as a{" "}
                            <code>
                                {"{username}"}/{"{model-id}"}
                            </code>{" "}
                            model with your own per-1M-token pricing.
                        </>
                    ) : (
                        <>
                            Register an OpenAI-compatible endpoint as a{" "}
                            <code>
                                {"{username}"}/{"{model-id}"}
                            </code>{" "}
                            model with your own per-1M-token pricing.
                        </>
                    )}
                </p>
            </div>

            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
                data-form-type="other"
            >
                <ScrollArea className="min-h-0 flex-1 space-y-4 overscroll-contain px-6 pb-2">
                    {error && <Alert intent="danger">{error}</Alert>}

                    {!isEdit && (
                        <FieldStack
                            label="How to register"
                            helper={
                                isPromptAgent
                                    ? "Pollinations deploys and runs a prompt agent for you — no endpoint or token needed."
                                    : isSource
                                      ? "Upload a single-file worker; Pollinations deploys and hosts it — no token needed."
                                      : "Point at your own OpenAI-compatible endpoint. You host and run it."
                            }
                            alignLabelRow
                        >
                            <div className="flex flex-wrap gap-2">
                                <ToggleButton
                                    active={form.mode === "external"}
                                    onClick={() => updateMode("external")}
                                >
                                    External endpoint
                                </ToggleButton>
                                <ToggleButton
                                    active={isSource}
                                    onClick={() => updateMode("source")}
                                >
                                    Upload worker code
                                </ToggleButton>
                                <ToggleButton
                                    active={isPromptAgent}
                                    onClick={() => updateMode("prompt-agent")}
                                >
                                    Prompt agent
                                </ToggleButton>
                            </div>
                        </FieldStack>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <FieldStack
                            label="Model ID"
                            helper="Public id: {username}/{model-id}."
                            alignLabelRow
                        >
                            <Input
                                name="community-model-name"
                                value={form.name}
                                placeholder="my-model"
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                required
                                onChange={(e) =>
                                    updateForm("name", e.target.value)
                                }
                            />
                        </FieldStack>
                        <FieldStack
                            label="Description"
                            helper="Shown in the Models list, like registry models."
                            alignLabelRow
                        >
                            <Input
                                name="community-model-description"
                                value={form.description}
                                placeholder="Fast coding model, long context"
                                autoComplete="off"
                                maxLength={240}
                                onChange={(e) =>
                                    updateForm("description", e.target.value)
                                }
                            />
                        </FieldStack>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <FieldStack
                            label="Type"
                            helper="Agents run multi-step or tool-using logic behind the chat-completions shape."
                            alignLabelRow
                        >
                            <div className="flex gap-2">
                                <ToggleButton
                                    active={form.kind === "model"}
                                    onClick={() => updateKind("model")}
                                >
                                    Model
                                </ToggleButton>
                                <ToggleButton
                                    active={form.kind === "agent"}
                                    onClick={() => updateKind("agent")}
                                >
                                    Agent
                                </ToggleButton>
                            </div>
                        </FieldStack>
                        <FieldStack
                            label="Capabilities"
                            helper="Declared metadata shown in the model catalog."
                            alignLabelRow
                        >
                            <div className="flex flex-wrap gap-2">
                                {CAPABILITY_TOGGLES.map(({ key, label }) => (
                                    <ToggleButton
                                        key={key}
                                        active={form[key]}
                                        onClick={() => toggleCapability(key)}
                                    >
                                        {label}
                                    </ToggleButton>
                                ))}
                            </div>
                        </FieldStack>
                    </div>

                    {canPublish && (
                        <FieldStack
                            label="Visibility"
                            helper={
                                isShared
                                    ? "Public: listed in /models and callable by anyone. Set your per-1M-token pricing below."
                                    : "Private: callable only by you with your API key, and never listed."
                            }
                            alignLabelRow
                        >
                            <div className="flex gap-2">
                                <ToggleButton
                                    active={form.visibility === "private"}
                                    onClick={() => updateVisibility("private")}
                                >
                                    Private
                                </ToggleButton>
                                <ToggleButton
                                    active={form.visibility === "public"}
                                    onClick={() => updateVisibility("public")}
                                >
                                    Public
                                </ToggleButton>
                            </div>
                        </FieldStack>
                    )}

                    {isPromptAgent && (
                        <PromptAgentFields
                            form={form}
                            isEdit={isEdit}
                            onChange={updateForm}
                            onToggleTool={toggleBuiltinTool}
                            onAddMcp={addMcpServer}
                            onUpdateMcp={updateMcpServer}
                            onRemoveMcp={removeMcpServer}
                        />
                    )}

                    {isSource && (
                        <SourceFields
                            name={form.name}
                            source={form.source}
                            onChange={updateForm}
                        />
                    )}

                    {form.mode === "external" && (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FieldStack
                                    label="Endpoint URL"
                                    helper="OpenAI-compatible /v1 base URL or full chat completions URL."
                                    alignLabelRow
                                >
                                    <Input
                                        name="community-endpoint-url"
                                        type="url"
                                        inputMode="url"
                                        value={form.baseUrl}
                                        placeholder="https://api.example.com/v1"
                                        autoComplete="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        required
                                        onChange={(e) =>
                                            updateForm(
                                                "baseUrl",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </FieldStack>
                                <FieldStack
                                    label="Provider model ID"
                                    helper={providerModelHelper(
                                        modelOptions,
                                        modelListState,
                                    )}
                                    alignLabelRow
                                    action={
                                        <Button
                                            type="button"
                                            size="sm"
                                            intent="info"
                                            className="shrink-0 text-sm"
                                            disabled={
                                                !hasToken ||
                                                form.baseUrl.trim() === "" ||
                                                modelListState.status ===
                                                    "loading"
                                            }
                                            onClick={() =>
                                                void handleFetchModels()
                                            }
                                        >
                                            {modelListState.status === "loading"
                                                ? "Fetching…"
                                                : "Fetch models"}
                                        </Button>
                                    }
                                >
                                    {modelOptions.length > 0 ? (
                                        <Dropdown
                                            align="end"
                                            open={providerModelMenuOpen}
                                            onOpenChange={
                                                setProviderModelMenuOpen
                                            }
                                            className="w-[var(--reference-width)] min-w-0 p-1"
                                            trigger={(menuOpen) => (
                                                <div className="relative w-full">
                                                    <Input
                                                        name="community-upstream-id"
                                                        value={
                                                            form.upstreamModel
                                                        }
                                                        placeholder="gpt-4o-mini"
                                                        className="w-full pr-10"
                                                        autoComplete="off"
                                                        autoCapitalize="none"
                                                        spellCheck={false}
                                                        data-lpignore="true"
                                                        data-1p-ignore="true"
                                                        data-bwignore="true"
                                                        onChange={(e) =>
                                                            updateForm(
                                                                "upstreamModel",
                                                                e.target.value,
                                                            )
                                                        }
                                                    />
                                                    <ChevronIcon
                                                        expanded={menuOpen}
                                                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-text-muted transition-transform"
                                                    />
                                                </div>
                                            )}
                                        >
                                            {(close) =>
                                                visibleModelOptions.length >
                                                0 ? (
                                                    <ScrollArea className="max-h-64">
                                                        <div className="flex flex-col">
                                                            {visibleModelOptions.map(
                                                                (model) => (
                                                                    <DropdownItem
                                                                        key={
                                                                            model
                                                                        }
                                                                        className={
                                                                            form.upstreamModel ===
                                                                            model
                                                                                ? "bg-theme-bg-active font-medium text-theme-text-strong"
                                                                                : undefined
                                                                        }
                                                                        onClick={() => {
                                                                            updateForm(
                                                                                "upstreamModel",
                                                                                model,
                                                                            );
                                                                            close();
                                                                        }}
                                                                    >
                                                                        <span className="truncate font-mono">
                                                                            {
                                                                                model
                                                                            }
                                                                        </span>
                                                                    </DropdownItem>
                                                                ),
                                                            )}
                                                        </div>
                                                    </ScrollArea>
                                                ) : (
                                                    <p className="m-0 px-2 py-2 text-sm text-theme-text-soft">
                                                        No fetched models match.
                                                    </p>
                                                )
                                            }
                                        </Dropdown>
                                    ) : (
                                        <Input
                                            name="community-upstream-id"
                                            value={form.upstreamModel}
                                            placeholder="gpt-4o-mini"
                                            autoComplete="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            data-lpignore="true"
                                            data-1p-ignore="true"
                                            data-bwignore="true"
                                            onFocus={() => {
                                                if (modelOptions.length > 0) {
                                                    setProviderModelMenuOpen(
                                                        true,
                                                    );
                                                }
                                            }}
                                            onChange={(e) =>
                                                updateForm(
                                                    "upstreamModel",
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    )}
                                </FieldStack>
                            </div>

                            <FieldStack
                                label="API bearer token"
                                helper={
                                    isEdit
                                        ? "Leave blank to keep the saved token. Enter a token to fetch models, test, or replace it."
                                        : "Stored encrypted and sent as Authorization: Bearer to your endpoint."
                                }
                                alignLabelRow
                            >
                                <Input
                                    name="community-api-bearer-token"
                                    type="password"
                                    value={form.bearerToken}
                                    placeholder={
                                        isEdit ? "Re-enter token" : undefined
                                    }
                                    autoComplete="new-password"
                                    autoCapitalize="none"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    data-bwignore="true"
                                    required={!isEdit}
                                    onChange={(e) =>
                                        updateForm(
                                            "bearerToken",
                                            e.target.value,
                                        )
                                    }
                                />
                            </FieldStack>

                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    type="button"
                                    intent="info"
                                    onClick={() => void handleTest()}
                                    disabled={
                                        !hasToken ||
                                        form.baseUrl.trim() === "" ||
                                        testState.status === "loading"
                                    }
                                >
                                    {testState.status === "loading"
                                        ? "Testing…"
                                        : "Test endpoint"}
                                </Button>
                                {testState.status === "error" &&
                                    testState.message && (
                                        <p className="text-sm text-intent-danger-text">
                                            {testState.message}
                                        </p>
                                    )}
                            </div>
                        </>
                    )}

                    {isShared && (
                        <>
                            <PriceGroups
                                form={form}
                                testState={testState}
                                visiblePriceKeys={visiblePriceKeys}
                                onChange={updateForm}
                            />

                            <FieldStack
                                label="Tool fees"
                                helper={
                                    isPromptAgent
                                        ? "Pollen charged per tool call the agent makes. Use the built-in tool names (web_search, image) or mcp_call for MCP tools."
                                        : "Pollen charged per tool call, billed from the usage.tool_call_counts your endpoint reports (e.g. web_search)."
                                }
                                alignLabelRow
                                action={
                                    <Button
                                        type="button"
                                        size="sm"
                                        intent="info"
                                        className="shrink-0 text-sm"
                                        onClick={addToolFee}
                                    >
                                        Add tool fee
                                    </Button>
                                }
                            >
                                {form.toolFees.length > 0 && (
                                    <div className="grid gap-2">
                                        {form.toolFees.map((row, index) => (
                                            <div
                                                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id until named
                                                key={index}
                                                className="flex items-center gap-2"
                                            >
                                                <Input
                                                    name={`community-tool-fee-name-${index}`}
                                                    value={row.name}
                                                    placeholder="web_search"
                                                    autoComplete="off"
                                                    autoCapitalize="none"
                                                    spellCheck={false}
                                                    className="flex-1"
                                                    onChange={(e) =>
                                                        updateToolFee(
                                                            index,
                                                            "name",
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                <Input
                                                    name={`community-tool-fee-price-${index}`}
                                                    value={row.price}
                                                    placeholder="0.005"
                                                    inputMode="decimal"
                                                    autoComplete="off"
                                                    className="w-32"
                                                    onChange={(e) =>
                                                        updateToolFee(
                                                            index,
                                                            "price",
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                <IconButton
                                                    intent="danger"
                                                    title="Remove tool fee"
                                                    tooltip="Remove tool fee"
                                                    onClick={() =>
                                                        removeToolFee(index)
                                                    }
                                                >
                                                    <XIcon className="h-4 w-4" />
                                                </IconButton>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </FieldStack>
                        </>
                    )}
                </ScrollArea>

                <div className="flex shrink-0 justify-end gap-2 p-6 pt-4">
                    <Button
                        type="button"
                        className="disabled:opacity-50"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        className="disabled:opacity-50"
                        disabled={!canSubmit}
                    >
                        {isSubmitting
                            ? "Saving…"
                            : isEdit
                              ? "Save Model"
                              : "Add Model"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}

// Matches SourceSchema.max on the backend (1 MiB single-ES-module worker).
const MAX_SOURCE_BYTES = 1_048_576;

// Upload-worker-code registration: the owner pastes a single-file worker that
// Pollinations deploys and hosts. Editable in both create and edit (the update
// endpoint accepts `source` and redeploys).
function SourceFields({
    name,
    source,
    onChange,
}: {
    name: string;
    source: string;
    onChange: (key: keyof EndpointFormState, value: string) => void;
}) {
    const byteLength = new TextEncoder().encode(source).length;
    const overLimit = byteLength > MAX_SOURCE_BYTES;
    const modelId = name.trim() || "my-model";
    return (
        <div className="space-y-4">
            <FieldStack
                label="Worker source"
                helper="A single ES-module worker exposing POST /v1/chat/completions. Deployed to a Pollinations-managed Cloudflare Worker."
                alignLabelRow
            >
                <Textarea
                    name="community-worker-source"
                    value={source}
                    placeholder={
                        "export default {\n  async fetch(request, env) {\n    // return an OpenAI-compatible chat completion\n  },\n};"
                    }
                    rows={12}
                    spellCheck={false}
                    error={overLimit}
                    className="font-mono text-sm"
                    onChange={(e) => onChange("source", e.target.value)}
                />
                <p
                    className={cn(
                        "mt-1 text-xs",
                        overLimit
                            ? "text-intent-danger-text"
                            : "text-theme-text-muted",
                    )}
                >
                    {(byteLength / 1024).toFixed(1)} KiB / 1024 KiB
                    {overLimit && " — worker source exceeds the 1 MiB limit"}
                </p>
            </FieldStack>

            <Alert intent="info">
                Prefer the CLI for larger workers or files on disk:
                <code className="mt-1 block whitespace-pre-wrap break-all font-mono text-xs">
                    polli my-models create --name {modelId} --source ./worker.js
                </code>
            </Alert>
        </div>
    );
}

// The no-code prompt-agent config: a system prompt over a base model, plus
// optional built-in tools and MCP servers. In edit mode this config is
// read-only — the update endpoint does not accept prompt-agent changes, so the
// owner recreates the agent to change it.
function PromptAgentFields({
    form,
    isEdit,
    onChange,
    onToggleTool,
    onAddMcp,
    onUpdateMcp,
    onRemoveMcp,
}: {
    form: EndpointFormState;
    isEdit: boolean;
    onChange: (key: keyof EndpointFormState, value: string) => void;
    onToggleTool: (tool: PromptAgentBuiltinTool) => void;
    onAddMcp: () => void;
    onUpdateMcp: (
        index: number,
        key: keyof McpServerRow,
        value: string,
    ) => void;
    onRemoveMcp: (index: number) => void;
}) {
    return (
        <div className="space-y-4">
            {isEdit && (
                <Alert intent="info">
                    A prompt agent&rsquo;s configuration is fixed after
                    creation. To change the system prompt, base model, tools, or
                    MCP servers, delete this agent and create a new one.
                </Alert>
            )}

            <FieldStack
                label="System prompt"
                helper="The agent's instructions, sent as the system message on every call."
                alignLabelRow
            >
                <Textarea
                    name="prompt-agent-system-prompt"
                    value={form.systemPrompt}
                    placeholder="You are a helpful assistant that…"
                    rows={6}
                    maxLength={8000}
                    disabled={isEdit}
                    onChange={(e) => onChange("systemPrompt", e.target.value)}
                />
            </FieldStack>

            <FieldStack
                label="Base model"
                helper="A Pollinations model id the agent runs on, e.g. openai or claude."
                alignLabelRow
            >
                <Input
                    name="prompt-agent-base-model"
                    value={form.baseModel}
                    placeholder="openai"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isEdit}
                    onChange={(e) => onChange("baseModel", e.target.value)}
                />
            </FieldStack>

            <FieldStack
                label="Built-in tools"
                helper="Tools the agent can call. Fees are charged per call under the tool name."
                alignLabelRow
            >
                <div className="flex flex-wrap gap-2">
                    {PROMPT_AGENT_BUILTIN_TOOLS.map((tool) => (
                        <ToggleButton
                            key={tool}
                            active={form.builtinTools.includes(tool)}
                            onClick={() => !isEdit && onToggleTool(tool)}
                        >
                            {BUILTIN_TOOL_LABELS[tool]}
                        </ToggleButton>
                    ))}
                </div>
            </FieldStack>

            <FieldStack
                label="MCP servers"
                helper="Streamable-HTTP MCP servers whose tools the agent can call (billed as mcp_call)."
                alignLabelRow
                action={
                    !isEdit && (
                        <Button
                            type="button"
                            size="sm"
                            intent="info"
                            className="shrink-0 text-sm"
                            onClick={onAddMcp}
                        >
                            Add MCP server
                        </Button>
                    )
                }
            >
                {form.mcpServers.length > 0 && (
                    <div className="grid gap-2">
                        {form.mcpServers.map((row, index) => (
                            <div
                                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id until named
                                key={index}
                                className="flex items-center gap-2"
                            >
                                <Input
                                    name={`prompt-agent-mcp-name-${index}`}
                                    value={row.name}
                                    placeholder="my-server"
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="w-40 shrink-0"
                                    disabled={isEdit}
                                    onChange={(e) =>
                                        onUpdateMcp(
                                            index,
                                            "name",
                                            e.target.value,
                                        )
                                    }
                                />
                                <Input
                                    name={`prompt-agent-mcp-url-${index}`}
                                    type="url"
                                    inputMode="url"
                                    value={row.url}
                                    placeholder="https://mcp.example.com"
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="flex-1"
                                    disabled={isEdit}
                                    onChange={(e) =>
                                        onUpdateMcp(
                                            index,
                                            "url",
                                            e.target.value,
                                        )
                                    }
                                />
                                <Input
                                    name={`prompt-agent-mcp-auth-${index}`}
                                    type="password"
                                    value={row.auth}
                                    placeholder="Bearer token (optional)"
                                    autoComplete="off"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    data-bwignore="true"
                                    className="w-48 shrink-0"
                                    disabled={isEdit}
                                    onChange={(e) =>
                                        onUpdateMcp(
                                            index,
                                            "auth",
                                            e.target.value,
                                        )
                                    }
                                />
                                {!isEdit && (
                                    <IconButton
                                        intent="danger"
                                        title="Remove MCP server"
                                        tooltip="Remove MCP server"
                                        onClick={() => onRemoveMcp(index)}
                                    >
                                        <XIcon className="h-4 w-4" />
                                    </IconButton>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </FieldStack>
        </div>
    );
}
