import {
    Alert,
    Button,
    ButtonGroup,
    CheckIcon,
    ChevronIcon,
    Dialog,
    DialogTitle,
    Dropdown,
    DropdownItem,
    FieldStack,
    Input,
    ScrollArea,
    TabButton,
} from "@pollinations/ui";
import type { CommunityEndpointVisibility } from "@shared/community-endpoints.ts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    BASE_TEXT_PRICE_KEYS,
    formWithVisiblePrices,
    hasValidVisibleFormPrices,
    PriceGroups,
    returnedPriceFields,
    savedEndpointPriceKeys,
    visiblePriceFieldKeys,
} from "./price-table.tsx";
import { PromptAgentFields } from "./prompt-agent-fields.tsx";
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
    type PromptAgentBuiltinTool,
    providerModelHelper,
    readError,
    toEndpointPayload,
} from "./types.ts";

function isValidMcpRow(row: McpServerRow): boolean {
    const name = row.name.trim();
    const url = row.url.trim();
    // Fully-empty rows are dropped on submit, so treat them as valid here.
    if (!name && !url) return true;
    try {
        new URL(url);
    } catch {
        return false;
    }
    return MCP_SERVER_NAME_PATTERN.test(name);
}

function ToggleButton({
    active,
    disabled = false,
    onClick,
    children,
}: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Button
            type="button"
            size="sm"
            intent={active ? "info" : undefined}
            aria-pressed={active}
            className={
                active
                    ? "text-sm"
                    : disabled
                      ? "text-sm opacity-40"
                      : "text-sm opacity-70"
            }
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

type CommunityEndpointDialogProps = {
    /** Present in edit mode (prefills the form); omit to create. */
    endpoint?: CommunityEndpoint;
    // Allowlisted owners can choose Public. Everyone else sees the same
    // lifecycle control with Public disabled.
    canPublish: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (payload: EndpointPayload, bearerToken: string) => Promise<void>;
    /** Create-mode trigger rendered by the parent (e.g. the Section action). */
    trigger?: ReactNode;
};

export function CommunityEndpointDialog({
    endpoint,
    canPublish,
    open,
    onOpenChange,
    onSubmit,
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

    function updateForm(key: keyof EndpointFormState, value: string): void {
        setForm((current) => nextFormState(current, key, value));
        if (
            key === "modality" ||
            key === "name" ||
            key === "upstreamModel" ||
            key === "baseUrl" ||
            key === "bearerToken"
        ) {
            setTestState(idleAction);
        }
        if (key === "modality" || key === "baseUrl" || key === "bearerToken") {
            setModelOptions([]);
            setModelListState(idleAction);
            setProviderModelMenuOpen(false);
        }
        if (key === "upstreamModel" && modelOptions.length > 0) {
            setProviderModelMenuOpen(true);
        }
    }

    function updateVisibility(visibility: CommunityEndpointVisibility): void {
        setForm((current) => ({ ...current, visibility }));
        setError(null);
    }

    function updateMode(mode: EndpointMode): void {
        setForm((current) => ({
            ...current,
            mode,
            modality: mode === "prompt-agent" ? "text" : current.modality,
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
            mcpServers: [...current.mcpServers, { name: "", url: "" }],
        }));
    }

    function removeMcpServer(index: number): void {
        setForm((current) => ({
            ...current,
            mcpServers: current.mcpServers.filter((_, i) => i !== index),
        }));
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
                    modality: form.modality,
                    model: form.upstreamModel.trim() || form.name.trim(),
                },
            });
            if (!response.ok) throw new Error(await readError(response));
            const body =
                (await response.json()) as CommunityEndpointTestResponse;
            const detectedImagePricing =
                form.modality === "image"
                    ? (body.imagePricing ?? "request")
                    : form.imagePricing;
            const returnedFields = returnedPriceFields(
                {
                    status: "success",
                    usage: body.usage,
                    billableUsage: body.billableUsage,
                },
                form.modality,
                detectedImagePricing,
            );
            if (returnedFields.length === 0) {
                throw new Error(
                    form.modality === "image"
                        ? "Endpoint responded, but did not return image data"
                        : "Endpoint responded, but did not return billable usage",
                );
            }
            if (detectedImagePricing !== form.imagePricing) {
                setForm((current) => ({
                    ...current,
                    imagePricing: detectedImagePricing,
                    promptTextPrice: "",
                    promptImagePrice: "",
                    completionImagePrice: "",
                }));
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
            const payload = toEndpointPayload(
                formWithVisiblePrices(form, visiblePriceKeys),
            );
            // Agent configuration is immutable after creation. Metadata and
            // visibility can still be edited without redeploying the worker.
            if (isEdit && endpoint?.promptAgent) {
                payload.promptAgent = undefined;
            }
            await onSubmit(payload, form.bearerToken.trim());
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

    // Pricing is only meaningful when the model is (or is being made) public —
    // keyed off the LIVE form value so flipping Visibility to Public in place
    // reveals the test + pricing section immediately. Private models carry no
    // pricing (owner is the only caller).
    const isShared = form.visibility === "public";
    // A prompt agent is platform-deployed: the worker doesn't exist until
    // saved, so there is no create-time endpoint to test.
    const isPromptAgent = form.mode === "prompt-agent";
    const returnedFields =
        isShared && !isPromptAgent
            ? returnedPriceFields(testState, form.modality, form.imagePricing)
            : [];
    // Reveal the modality's base price plus whatever the test observed or the
    // model already had saved. Blank and zero prices mean free.
    const basePriceKeys =
        form.modality === "image"
            ? (["completionImagePrice"] as const)
            : BASE_TEXT_PRICE_KEYS;
    const visiblePriceKeys = new Set(
        isShared
            ? visiblePriceFieldKeys(savedPriceKeys, returnedFields, [
                  ...basePriceKeys,
              ])
            : [],
    );
    const hasValidVisiblePrices = hasValidVisibleFormPrices(
        form,
        visiblePriceKeys,
    );
    // First-time publishing of an external endpoint re-observes its billed
    // buckets, so it needs a successful test. A model already saved as public
    // has server-validated pricing, so re-editing it (e.g. a price or
    // description tweak) does not force another test. Private models defer
    // pricing entirely. External endpoints always need a token to be callable
    // at all.
    const alreadyPublic = isEdit && endpoint?.visibility === "public";
    // Prompt agents can't be endpoint-tested before they exist, so publishing
    // one gates on pricing only.
    const needsTest = isShared && !alreadyPublic && !isPromptAgent;
    const testRequirementMet =
        testState.status === "success" && returnedFields.length > 0;
    // A prompt agent mints and manages its own worker token — no bearer token.
    const saveRequirementMet = isPromptAgent
        ? true
        : needsTest
          ? testRequirementMet && (isEdit || hasToken)
          : isEdit || hasToken;
    const providerModelQuery = form.upstreamModel.trim().toLowerCase();
    const visibleModelOptions =
        providerModelQuery === ""
            ? modelOptions
            : modelOptions.filter((model) =>
                  model.toLowerCase().includes(providerModelQuery),
              );
    const hasValidMcpServers = form.mcpServers.every(isValidMcpRow);
    const modeRequirementsMet = isPromptAgent
        ? form.systemPrompt.trim() !== "" &&
          form.baseModel.trim() !== "" &&
          hasValidMcpServers
        : form.baseUrl.trim() !== "";
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        modeRequirementsMet &&
        hasValidVisiblePrices &&
        saveRequirementMet;

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
                    {form.mode === "prompt-agent" ? (
                        <>
                            Deploy a no-code agent — a system prompt over a base
                            model, with optional built-in tools and MCP servers
                            — as a{" "}
                            <code>
                                {"{username}"}/{"{model-id}"}
                            </code>{" "}
                            model. Pollinations hosts and runs it.
                        </>
                    ) : (
                        <>
                            Register an OpenAI-compatible endpoint as a{" "}
                            <code>
                                {"{username}"}/{"{model-id}"}
                            </code>{" "}
                            model.
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
                                    active={isPromptAgent}
                                    onClick={() => updateMode("prompt-agent")}
                                >
                                    Prompt agent
                                </ToggleButton>
                            </div>
                        </FieldStack>
                    )}

                    {!isPromptAgent && (
                        <FieldStack
                            label="Modality"
                            helper={
                                isEdit
                                    ? "Existing models keep their registered modality."
                                    : "Choose the public API family this endpoint serves."
                            }
                            alignLabelRow
                        >
                            <div className="grid grid-cols-2 gap-2">
                                {(["text", "image"] as const).map(
                                    (modality) => {
                                        const selected =
                                            form.modality === modality;
                                        return (
                                            <button
                                                key={modality}
                                                type="button"
                                                disabled={isEdit}
                                                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                                    selected
                                                        ? "border-theme-border-active bg-theme-bg-active text-theme-text-strong"
                                                        : "border-divider bg-surface text-theme-text-muted hover:bg-surface-opaque"
                                                }`}
                                                onClick={() =>
                                                    updateForm(
                                                        "modality",
                                                        modality,
                                                    )
                                                }
                                            >
                                                {modality === "image"
                                                    ? "Image"
                                                    : "Text"}
                                            </button>
                                        );
                                    },
                                )}
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

                    <FieldStack
                        label="Visibility"
                        helper={
                            isShared
                                ? "Public: listed in /models and callable by anyone. Set optional per-1M-token prices below, or leave them at 0 for free."
                                : canPublish
                                  ? "Private: callable only by you and shown only in model lists authenticated with your API key."
                                  : "Private: callable only by you. Publishing publicly requires approval."
                        }
                        alignLabelRow
                    >
                        <ButtonGroup aria-label="Model visibility">
                            <TabButton
                                active={form.visibility === "private"}
                                onClick={() => updateVisibility("private")}
                                size="sm"
                                className="min-w-24 gap-1.5"
                            >
                                {form.visibility === "private" && (
                                    <CheckIcon className="h-3.5 w-3.5" />
                                )}
                                Private
                            </TabButton>
                            <TabButton
                                active={form.visibility === "public"}
                                disabled={!canPublish}
                                onClick={() => updateVisibility("public")}
                                size="sm"
                                className="min-w-24 gap-1.5"
                            >
                                {form.visibility === "public" && (
                                    <CheckIcon className="h-3.5 w-3.5" />
                                )}
                                Public
                            </TabButton>
                        </ButtonGroup>
                    </FieldStack>

                    {isPromptAgent ? (
                        <PromptAgentFields
                            form={form}
                            disabled={isEdit}
                            onChange={updateForm}
                            onToggleTool={toggleBuiltinTool}
                            onAddMcp={addMcpServer}
                            onUpdateMcp={updateMcpServer}
                            onRemoveMcp={removeMcpServer}
                        />
                    ) : (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FieldStack
                                    label="Endpoint URL"
                                    helper="OpenAI-compatible /v1 base URL, or full chat/image generation URL."
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
                                    helper={
                                        canPublish
                                            ? providerModelHelper(
                                                  modelOptions,
                                                  modelListState,
                                              )
                                            : "Enter the upstream model ID manually."
                                    }
                                    alignLabelRow
                                    action={
                                        canPublish ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                intent="info"
                                                className="shrink-0 text-sm"
                                                disabled={
                                                    !hasToken ||
                                                    form.baseUrl.trim() ===
                                                        "" ||
                                                    modelListState.status ===
                                                        "loading"
                                                }
                                                onClick={() =>
                                                    void handleFetchModels()
                                                }
                                            >
                                                {modelListState.status ===
                                                "loading"
                                                    ? "Fetching…"
                                                    : "Fetch models"}
                                            </Button>
                                        ) : undefined
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
                                                        placeholder={
                                                            form.modality ===
                                                            "image"
                                                                ? "gpt-image-2"
                                                                : "gpt-4o-mini"
                                                        }
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
                                            placeholder={
                                                form.modality === "image"
                                                    ? "gpt-image-2"
                                                    : "gpt-4o-mini"
                                            }
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

                            {canPublish && (
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
                            )}
                        </>
                    )}

                    {isShared && (
                        <PriceGroups
                            form={form}
                            modality={form.modality}
                            imagePricing={form.imagePricing}
                            testState={testState}
                            visiblePriceKeys={visiblePriceKeys}
                            onChange={updateForm}
                        />
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
                              : isShared
                                ? isPromptAgent
                                    ? "Publish Agent"
                                    : "Publish Model"
                                : isPromptAgent
                                  ? "Add Private Agent"
                                  : "Add Private Model"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
