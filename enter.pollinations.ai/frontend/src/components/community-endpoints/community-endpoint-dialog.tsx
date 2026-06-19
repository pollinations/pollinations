import {
    Alert,
    Button,
    ChevronIcon,
    Chip,
    Dialog,
    DialogTitle,
    Dropdown,
    DropdownItem,
    Field,
    FieldStack,
    Input,
    ScrollArea,
    Surface,
} from "@pollinations/ui";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
import type { FormEvent, ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    type ActionState,
    type CommunityEndpoint,
    type CommunityEndpointTestResponse,
    type EndpointFormState,
    type EndpointPayload,
    emptyForm,
    endpointToForm,
    hasObservedPriceField,
    idleAction,
    isValidPriceInput,
    nextFormState,
    observedUsageValue,
    pricePerMillionToPerToken,
    providerModelHelper,
    readError,
    toEndpointPayload,
} from "./types.ts";

type CommunityEndpointDialogProps = {
    /** Present in edit mode (prefills the form); omit to create. */
    endpoint?: CommunityEndpoint;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (payload: EndpointPayload, bearerToken: string) => Promise<void>;
    /** Create-mode trigger rendered by the parent (e.g. the Section action). */
    trigger?: ReactNode;
};

const usageNumberFormatter = new Intl.NumberFormat("en-US");
type PriceField = (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number];
type SimulatedCostLine = {
    field: PriceField;
    tokens: number;
    cost: number;
};

const PRICE_GROUPS: {
    title: string;
    fields: PriceField[];
}[] = [
    {
        title: "Prompt tokens",
        fields: COMMUNITY_ENDPOINT_PRICE_FIELDS.filter((field) =>
            field.usageType.startsWith("prompt"),
        ),
    },
    {
        title: "Completion tokens",
        fields: COMMUNITY_ENDPOINT_PRICE_FIELDS.filter((field) =>
            field.usageType.startsWith("completion"),
        ),
    },
];

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
    const tokenForRequest = hasToken
        ? { bearerToken: form.bearerToken.trim() }
        : {};

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
            const json = {
                baseUrl: form.baseUrl.trim(),
                ...tokenForRequest,
            };
            const response =
                isEdit && endpoint
                    ? await apiClient["community-endpoints"][
                          ":id"
                      ].models.$post({
                          param: { id: endpoint.id },
                          json,
                      })
                    : await apiClient["community-endpoints"].models.$post({
                          json,
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
            const json = {
                baseUrl: form.baseUrl.trim(),
                model: form.upstreamModel.trim() || form.name.trim(),
                ...tokenForRequest,
            };
            const response =
                isEdit && endpoint
                    ? await apiClient["community-endpoints"][":id"].test.$post({
                          param: { id: endpoint.id },
                          json,
                      })
                    : await apiClient["community-endpoints"].test.$post({
                          json: {
                              ...json,
                              bearerToken: form.bearerToken.trim(),
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
        hasDefinedPriceInput(form, field),
    );
    const testRequirementMet = isEdit
        ? testState.status !== "error"
        : testState.status === "success" && returnedFields.length > 0;
    const providerModelQuery = form.upstreamModel.trim().toLowerCase();
    const visibleModelOptions =
        providerModelQuery === ""
            ? modelOptions
            : modelOptions.filter((model) =>
                  model.toLowerCase().includes(providerModelQuery),
              );
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.baseUrl.trim() !== "" &&
        hasVisiblePriceFields &&
        hasValidVisiblePrices &&
        hasRequiredReturnedPrices &&
        testRequirementMet &&
        (isEdit || hasToken);

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
                        community/{"{username}"}/{"{model-id}"}
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
                            helper="Public id: community/{username}/{model-id}."
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
                                ? "Saved token is configured. Leave blank to keep it; fetch models and test use it unless you enter a replacement."
                                : "Stored encrypted and sent as Authorization: Bearer to your endpoint."
                        }
                        alignLabelRow
                    >
                        <Input
                            name="community-api-bearer-token"
                            type="password"
                            value={form.bearerToken}
                            placeholder={
                                isEdit ? "Saved token configured" : undefined
                            }
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
                                (!isEdit && !hasToken) ||
                                form.baseUrl.trim() === "" ||
                                testState.status === "loading"
                            }
                        >
                            {testState.status === "loading"
                                ? "Testing…"
                                : "Test endpoint"}
                        </Button>
                        {testState.status !== "idle" && testState.message && (
                            <p className={testMessageClass(testState.status)}>
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

                    {testState.status === "success" && (
                        <SimulatedCostPreview
                            form={form}
                            testState={testState}
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
                              : "Add Model"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}

function testMessageClass(status: ActionState["status"]): string {
    if (status === "error") return "text-sm text-intent-danger-text";
    if (status === "success") return "text-sm text-intent-success-text";
    return "text-sm text-theme-text-muted";
}

function PriceGroups({
    form,
    testState,
    visiblePriceKeys,
    onChange,
}: {
    form: EndpointFormState;
    testState: ActionState;
    visiblePriceKeys: Set<PriceField["key"]>;
    onChange: (key: keyof EndpointFormState, value: string) => void;
}) {
    const showReturnedColumn = testState.status === "success";
    const visibleGroups = PRICE_GROUPS.map((group) => ({
        ...group,
        fields: group.fields.filter((field) => visiblePriceKeys.has(field.key)),
    })).filter((group) => group.fields.length > 0);

    if (visibleGroups.length === 0) return null;

    return (
        <Surface className="overflow-hidden p-0">
            <div className={priceHeaderClass(showReturnedColumn)}>
                <span>Usage</span>
                <span>Price / 1M</span>
                {showReturnedColumn && (
                    <span className="text-right">Test returned</span>
                )}
            </div>
            <div className="divide-y divide-divider">
                {visibleGroups.map((group) => (
                    <Fragment key={group.title}>
                        <PriceSectionHeader
                            group={group}
                            testState={testState}
                        />
                        {group.fields.map((field) => (
                            <PriceRow
                                key={field.key}
                                field={field}
                                value={form[field.key]}
                                observedValue={observedUsageValue(
                                    testState.usage,
                                    testState.billableUsage,
                                    field,
                                )}
                                showReturnedColumn={showReturnedColumn}
                                onChange={(value) => onChange(field.key, value)}
                            />
                        ))}
                    </Fragment>
                ))}
            </div>
        </Surface>
    );
}

function PriceSectionHeader({
    group,
    testState,
}: {
    group: (typeof PRICE_GROUPS)[number];
    testState: ActionState;
}) {
    const observedCount = group.fields.filter(
        (field) =>
            observedUsageValue(
                testState.usage,
                testState.billableUsage,
                field,
            ) !== null,
    ).length;

    return (
        <div className="flex min-w-0 items-center justify-between gap-2 bg-theme-bg-active/35 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-theme-text-muted">
                {group.title}
            </h3>
            {observedCount > 0 && (
                <Chip intent="success" size="sm">
                    {observedCount} returned by test
                </Chip>
            )}
        </div>
    );
}

function PriceRow({
    field,
    value,
    observedValue,
    showReturnedColumn,
    onChange,
}: {
    field: PriceField;
    value: string;
    observedValue: number | null;
    showReturnedColumn: boolean;
    onChange: (value: string) => void;
}) {
    const observed = observedValue !== null;
    const missing = observed && value.trim() === "";
    const invalid = !isValidPriceInput(value);

    return (
        <Field.Root
            className={priceRowClass(
                observed,
                showReturnedColumn,
                invalid || missing,
            )}
        >
            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    <Field.Label className="min-w-0 truncate text-sm font-medium text-theme-text-strong">
                        {shortPriceLabel(field.label)}
                    </Field.Label>
                    {observed && (
                        <Chip
                            intent="success"
                            size="sm"
                            className="uppercase tracking-wide"
                        >
                            returned
                        </Chip>
                    )}
                </div>
                <p
                    className={
                        invalid || missing
                            ? "mt-0.5 text-xs text-intent-danger-text"
                            : "mt-0.5 text-xs text-theme-text-muted sm:hidden"
                    }
                >
                    {invalid
                        ? "Use a dot decimal like 0.1"
                        : missing
                          ? "Required for returned usage"
                          : "Pollen per 1M tokens"}
                </p>
            </div>

            <Input
                name={`community-${field.key}`}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                hideNumberSteppers
                value={value}
                placeholder="0"
                autoComplete="off"
                error={invalid || missing}
                className="h-9 font-mono tabular-nums sm:text-right"
                onChange={(e) => onChange(e.target.value)}
            />

            {showReturnedColumn && (
                <div className="min-w-0 text-xs sm:text-right">
                    {observed ? (
                        <span className="font-mono font-semibold tabular-nums text-intent-success-text">
                            {usageNumberFormatter.format(observedValue)}
                        </span>
                    ) : (
                        <span className="text-theme-text-muted">-</span>
                    )}
                </div>
            )}
        </Field.Root>
    );
}

function savedEndpointPriceKeys(
    endpoint: CommunityEndpoint | undefined,
): Set<PriceField["key"]> {
    return new Set(
        endpoint
            ? COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
                  (field) => endpoint[field.key] > 0,
              ).map((field) => field.key)
            : [],
    );
}

function returnedPriceFields(testState: ActionState): PriceField[] {
    if (testState.status !== "success") return [];
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.filter((field) =>
        hasObservedPriceField(testState.usage, field),
    );
}

function visiblePriceFieldKeys(
    savedPriceKeys: Set<PriceField["key"]>,
    returnedFields: PriceField[],
): Set<PriceField["key"]> {
    return new Set([
        ...savedPriceKeys,
        ...returnedFields.map((field) => field.key),
    ]);
}

function formWithVisiblePrices(
    form: EndpointFormState,
    visiblePriceKeys: Set<PriceField["key"]>,
): EndpointFormState {
    const next = { ...form };
    for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
        if (!visiblePriceKeys.has(field.key)) {
            next[field.key] = "";
        }
    }
    return next;
}

function hasDefinedPriceInput(
    form: EndpointFormState,
    field: PriceField,
): boolean {
    return form[field.key].trim() !== "" && isValidPriceInput(form[field.key]);
}

function hasValidVisibleFormPrices(
    form: EndpointFormState,
    visiblePriceKeys: Set<PriceField["key"]>,
): boolean {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.every(
        (field) =>
            !visiblePriceKeys.has(field.key) ||
            isValidPriceInput(form[field.key]),
    );
}

function priceHeaderClass(showReturnedColumn: boolean): string {
    const columns = showReturnedColumn
        ? "sm:grid-cols-[minmax(0,1fr)_9rem_10rem]"
        : "sm:grid-cols-[minmax(0,1fr)_9rem]";
    return `hidden gap-3 border-b border-divider bg-theme-bg-active/40 px-3 py-1.5 text-micro font-semibold uppercase tracking-wide text-theme-text-muted sm:grid ${columns}`;
}

function priceRowClass(
    observed: boolean,
    showReturnedColumn: boolean,
    invalid: boolean,
): string {
    const columns = showReturnedColumn
        ? "sm:grid-cols-[minmax(0,1fr)_9rem_10rem]"
        : "sm:grid-cols-[minmax(0,1fr)_9rem]";
    const base =
        "grid gap-2 border-l-4 px-3 py-2 transition-colors sm:items-center sm:gap-3";
    if (invalid) {
        return `${base} ${columns} border-l-intent-danger-border bg-intent-danger-bg-light/30`;
    }
    return observed
        ? `${base} ${columns} border-l-intent-success-text bg-intent-success-bg-light/30`
        : `${base} ${columns} border-l-transparent`;
}

function shortPriceLabel(label: string): string {
    return label.replace(/^Prompt /, "").replace(/^Completion /, "");
}

function SimulatedCostPreview({
    form,
    testState,
}: {
    form: EndpointFormState;
    testState: ActionState;
}) {
    const lines = simulatedCostLines(form, testState);
    if (lines.length === 0) return null;

    const totalCost = lines.reduce((sum, line) => sum + line.cost, 0);
    const pricedLineCount = lines.filter(
        (line) => line.tokens > 0 && line.cost > 0,
    ).length;

    return (
        <Surface className="p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-theme-text-strong">
                        Simulated cost
                    </p>
                    <p className="mt-0.5 text-xs text-theme-text-muted">
                        Current prices applied to the last test response.
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="font-mono text-base font-semibold tabular-nums text-theme-text-strong">
                        {formatPollenCost(totalCost)}
                    </p>
                    <p className="text-xs text-theme-text-muted">pollen</p>
                </div>
            </div>
            <div className="mt-2 grid gap-1.5">
                {lines.map((line) => (
                    <div
                        key={line.field.key}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-xs"
                    >
                        <span className="min-w-0 truncate text-theme-text-muted">
                            {line.field.label}
                        </span>
                        <span className="whitespace-nowrap font-mono tabular-nums text-theme-text-strong">
                            {usageNumberFormatter.format(line.tokens)} tokens
                        </span>
                        <span className="whitespace-nowrap text-right font-mono tabular-nums text-theme-text-strong">
                            {formatPollenCost(line.cost)} pollen
                        </span>
                    </div>
                ))}
            </div>
            {pricedLineCount === 0 && (
                <p className="mt-2 text-xs text-theme-text-muted">
                    Enter a price for any returned usage field to preview a
                    non-zero charge.
                </p>
            )}
        </Surface>
    );
}

function simulatedCostLines(
    form: EndpointFormState,
    testState: ActionState,
): SimulatedCostLine[] {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.flatMap((field) => {
        const tokens = observedUsageValue(
            testState.usage,
            testState.billableUsage,
            field,
        );
        if (tokens === null) return [];

        const pricePerToken = pricePerMillionToPerToken(form[field.key]);
        const cost = safeNumber(tokens * pricePerToken);
        return [{ field, tokens, cost }];
    });
}

function safeNumber(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatPollenCost(value: number): string {
    if (value === 0) return "0";
    if (value < 0.01) return value.toFixed(12).replace(/\.?0+$/, "");
    return String(Number(value.toPrecision(12)));
}
