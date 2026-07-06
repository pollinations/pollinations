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
    XIcon,
} from "@pollinations/ui";
import type { CommunityEndpointKind } from "@shared/community-endpoints.ts";
import { COMMUNITY_TOOL_NAME_PATTERN } from "@shared/registry/community-billing.ts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    formWithVisiblePrices,
    hasPositivePriceInput,
    hasValidVisibleFormPrices,
    PriceGroups,
    returnedPriceFields,
    savedEndpointPriceKeys,
    visiblePriceFieldKeys,
} from "./price-table.tsx";
import {
    type ActionState,
    type CommunityEndpoint,
    type CommunityEndpointTestResponse,
    type EndpointFormState,
    type EndpointPayload,
    emptyForm,
    endpointToForm,
    idleAction,
    nextFormState,
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
    /** Create-mode trigger rendered by the parent (e.g. the Section action). */
    trigger?: ReactNode;
};

export function CommunityEndpointDialog({
    endpoint,
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

    function updateKind(kind: CommunityEndpointKind): void {
        setForm((current) => ({ ...current, kind }));
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

    const returnedFields = returnedPriceFields(testState);
    const visiblePriceKeys = visiblePriceFieldKeys(
        savedPriceKeys,
        returnedFields,
    );
    const hasVisiblePriceFields = visiblePriceKeys.size > 0;
    const hasValidVisiblePrices = hasValidVisibleFormPrices(
        form,
        visiblePriceKeys,
    );
    const hasRequiredReturnedPrices = returnedFields.every((field) =>
        hasPositivePriceInput(form, field),
    );
    const testRequirementMet =
        testState.status === "success" && returnedFields.length > 0;
    const saveRequirementMet = isEdit || (testRequirementMet && hasToken);
    const providerModelQuery = form.upstreamModel.trim().toLowerCase();
    const visibleModelOptions =
        providerModelQuery === ""
            ? modelOptions
            : modelOptions.filter((model) =>
                  model.toLowerCase().includes(providerModelQuery),
              );
    const hasValidToolFees = form.toolFees.every(isValidToolFeeRow);
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.baseUrl.trim() !== "" &&
        hasVisiblePriceFields &&
        hasValidVisiblePrices &&
        hasRequiredReturnedPrices &&
        hasValidToolFees &&
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
                    Register an OpenAI-compatible endpoint as a{" "}
                    <code>
                        {"{username}"}/{"{model-id}"}
                    </code>{" "}
                    model with your own per-1M-token pricing.
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
                                    updateForm("baseUrl", e.target.value)
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
                                        modelListState.status === "loading"
                                    }
                                    onClick={() => void handleFetchModels()}
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
                                    onOpenChange={setProviderModelMenuOpen}
                                    className="w-[var(--reference-width)] min-w-0 p-1"
                                    trigger={(menuOpen) => (
                                        <div className="relative w-full">
                                            <Input
                                                name="community-upstream-id"
                                                value={form.upstreamModel}
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
                                        visibleModelOptions.length > 0 ? (
                                            <ScrollArea className="max-h-64">
                                                <div className="flex flex-col">
                                                    {visibleModelOptions.map(
                                                        (model) => (
                                                            <DropdownItem
                                                                key={model}
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
                                                                    {model}
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
                                            setProviderModelMenuOpen(true);
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
                            placeholder={isEdit ? "Re-enter token" : undefined}
                            autoComplete="new-password"
                            autoCapitalize="none"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-bwignore="true"
                            required={!isEdit}
                            onChange={(e) =>
                                updateForm("bearerToken", e.target.value)
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
                        {testState.status === "error" && testState.message && (
                            <p className="text-sm text-intent-danger-text">
                                {testState.message}
                            </p>
                        )}
                    </div>

                    <PriceGroups
                        form={form}
                        testState={testState}
                        visiblePriceKeys={visiblePriceKeys}
                        onChange={updateForm}
                    />

                    <FieldStack
                        label="Tool fees"
                        helper="Pollen charged per tool call, billed from the usage.tool_call_counts your endpoint reports (e.g. web_search)."
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
                                            onClick={() => removeToolFee(index)}
                                        >
                                            <XIcon className="h-4 w-4" />
                                        </IconButton>
                                    </div>
                                ))}
                            </div>
                        )}
                    </FieldStack>
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
