import {
    Alert,
    Button,
    ChevronIcon,
    Dialog,
    DialogTitle,
    Dropdown,
    DropdownItem,
    FieldStack,
    Input,
    ScrollArea,
} from "@pollinations/ui";
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
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.baseUrl.trim() !== "" &&
        hasVisiblePriceFields &&
        hasValidVisiblePrices &&
        hasRequiredReturnedPrices &&
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
                    model with your own pricing.
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
                            {(["text", "image"] as const).map((modality) => {
                                const selected = form.modality === modality;
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
                                            updateForm("modality", modality)
                                        }
                                    >
                                        {modality === "image"
                                            ? "Image"
                                            : "Text"}
                                    </button>
                                );
                            })}
                        </div>
                    </FieldStack>

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
                                                placeholder={
                                                    form.modality === "image"
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
                        modality={form.modality}
                        testState={testState}
                        visiblePriceKeys={visiblePriceKeys}
                        onChange={updateForm}
                    />
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
