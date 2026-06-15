import {
    Button,
    Dialog,
    DialogTitle,
    Field,
    Input,
    ScrollArea,
} from "@pollinations/ui";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { apiClient } from "../../api.ts";
import { CommunityEndpointUsageCounts } from "./community-endpoint-usage.tsx";
import {
    type ActionState,
    type CommunityEndpoint,
    type CommunityEndpointTestResponse,
    type EndpointFormState,
    type EndpointPayload,
    emptyForm,
    endpointToForm,
    hasPositiveFormPrice,
    idleAction,
    nextFormState,
    observedUsageValue,
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
    const [testState, setTestState] = useState<ActionState>(idleAction);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const modelListId = useId();

    // Reset the form each time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setForm(endpoint ? endpointToForm(endpoint) : emptyForm);
        setModelOptions([]);
        setModelListState(idleAction);
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
        setTestState(idleAction);
        if (key === "baseUrl" || key === "bearerToken") {
            setModelOptions([]);
            setModelListState(idleAction);
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
            await onSubmit(toEndpointPayload(form), form.bearerToken.trim());
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

    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.baseUrl.trim() !== "" &&
        hasPositiveFormPrice(form) &&
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
                    {error && (
                        <p className="rounded-lg bg-intent-danger-bg-light px-3 py-2 text-sm text-intent-danger-text">
                            {error}
                        </p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <DialogField
                            label="Model ID"
                            helper="Public id: community/{username}/{model-id}."
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
                        </DialogField>
                        <DialogField
                            label="Description"
                            helper="Shown in the Models list, like registry models."
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
                        </DialogField>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <DialogField
                            label="Endpoint URL"
                            helper="OpenAI-compatible /v1 base URL or full chat completions URL."
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
                        </DialogField>
                        <DialogField
                            label="Provider model ID"
                            helper={providerModelHelper(
                                modelOptions,
                                modelListState,
                            )}
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
                            <Input
                                name="community-upstream-id"
                                value={form.upstreamModel}
                                placeholder="gpt-4o-mini"
                                list={
                                    modelOptions.length > 0
                                        ? modelListId
                                        : undefined
                                }
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                onChange={(e) =>
                                    updateForm("upstreamModel", e.target.value)
                                }
                            />
                            {modelOptions.length > 0 && (
                                <datalist id={modelListId}>
                                    {modelOptions.map((model) => (
                                        <option key={model} value={model} />
                                    ))}
                                </datalist>
                            )}
                        </DialogField>
                    </div>

                    <DialogField
                        label="API bearer token"
                        helper={
                            isEdit
                                ? "Saved token is configured. Leave blank to keep it; fetch models and test use it unless you enter a replacement."
                                : "Stored encrypted and sent as Authorization: Bearer to your endpoint."
                        }
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
                    </DialogField>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => {
                            const observedValue = observedUsageValue(
                                testState.usage,
                                testState.billableUsage,
                                field,
                            );
                            return (
                                <DialogField
                                    key={field.key}
                                    label={field.label}
                                    helper={priceFieldHelper(
                                        field.label,
                                        observedValue,
                                    )}
                                >
                                    <Input
                                        name={`community-${field.key}`}
                                        type="number"
                                        step="any"
                                        min="0"
                                        inputMode="decimal"
                                        hideNumberSteppers
                                        value={form[field.key]}
                                        placeholder="0"
                                        autoComplete="off"
                                        className={
                                            observedValue !== null
                                                ? "bg-intent-success-bg-light/35"
                                                : undefined
                                        }
                                        onChange={(e) =>
                                            updateForm(
                                                field.key,
                                                e.target.value,
                                            )
                                        }
                                    />
                                </DialogField>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-start gap-3">
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
                        {testState.status !== "idle" && (
                            <div className="min-w-0 flex-1">
                                {testState.message && (
                                    <p
                                        className={testMessageClass(
                                            testState.status,
                                        )}
                                    >
                                        {testState.message}
                                    </p>
                                )}
                                {testState.status === "success" && (
                                    <CommunityEndpointUsageCounts
                                        usage={testState.usage}
                                        billableUsage={testState.billableUsage}
                                        className="mt-2 rounded-md border border-divider bg-surface-opaque/50 p-2"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="flex shrink-0 justify-end gap-2 p-6 pt-4">
                    <Button
                        type="button"
                        intent="danger"
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

function priceFieldHelper(label: string, observedValue: number | null): string {
    const base =
        "Pollen per 1M tokens. Leave at 0 when this usage is not billed.";
    if (observedValue === null) return base;
    return `Test returned ${usageNumberFormatter.format(observedValue)} ${label.toLowerCase()} tokens. ${base}`;
}

function DialogField({
    label,
    helper,
    action,
    children,
}: {
    label: string;
    helper?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Field.Root className="flex flex-col gap-1.5">
            {/* Fixed-height label row so inputs align across columns whether or
                not a field has an action button (e.g. "Fetch models"). Height
                clears the sm button (text-sm, ~27px) on every row. */}
            <div className="flex min-h-8 items-center justify-between gap-2">
                <Field.Label className="text-sm font-semibold">
                    {label}
                </Field.Label>
                {action}
            </div>
            {children}
            {helper && (
                <p className="text-xs leading-5 text-theme-text-muted">
                    {helper}
                </p>
            )}
        </Field.Root>
    );
}
