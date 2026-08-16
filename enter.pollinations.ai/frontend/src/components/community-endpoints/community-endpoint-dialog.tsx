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
    EditableCombobox,
    FieldStack,
    Input,
    ScrollArea,
    TabButton,
} from "@pollinations/ui";
import { MAX_FALLBACK_TARGETS } from "@shared/community-endpoints.ts";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { ModelListingFields } from "./model-listing-fields.tsx";
import {
    BASE_TEXT_PRICE_KEYS,
    formWithVisiblePrices,
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
    type FallbackModelOption,
    idleAction,
    isValidPerUserRpm,
    nextFormState,
    providerModelHelper,
    readError,
    toEndpointPayload,
} from "./types.ts";

type CommunityEndpointDialogProps = {
    /** Present in edit mode (prefills the form); omit to create. */
    endpoint?: CommunityEndpoint;
    // Allowlisted owners can choose Public. Everyone else sees the same
    // lifecycle control with Public disabled.
    canPublish: boolean;
    /** Public community models offered as fallback targets. */
    fallbackOptions: FallbackModelOption[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (payload: EndpointPayload, bearerToken: string) => Promise<void>;
    /** Create-mode trigger rendered by the parent (e.g. the Section action). */
    trigger?: ReactNode;
};

export function CommunityEndpointDialog({
    endpoint,
    canPublish,
    fallbackOptions,
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
    // null until the server answers, so the dropdown can fall back to the
    // catalog while it loads instead of briefly looking empty.
    const [fallbackCandidates, setFallbackCandidates] = useState<
        string[] | null
    >(null);
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
        setFallbackCandidates(null);
    }, [open, endpoint]);

    // Ask which models this one may fall back to. Only a saved model has an id
    // to ask about; a failure leaves the catalog list in place rather than
    // blocking the dialog on a feature the server re-validates on save anyway.
    const endpointId = endpoint?.id;
    useEffect(() => {
        if (!open || !endpointId) return;
        let active = true;
        void (async () => {
            try {
                const response = await apiClient.account["my-models"][":id"][
                    "fallback-candidates"
                ].$get({ param: { id: endpointId } });
                if (!response.ok) return;
                const { data } = await response.json();
                if (active) setFallbackCandidates(data);
            } catch {
                // Leave the catalog list in place.
            }
        })();
        return () => {
            active = false;
        };
    }, [open, endpointId]);

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
            setForm((current) => ({
                ...current,
                imagePricing: detectedImagePricing,
                inputModalities:
                    current.modality === "image" &&
                    body.inputModalities?.includes("image")
                        ? (["text", "image"] as ModelInputModality[])
                        : current.inputModalities,
                // Changing pricing mode changes the units of these fields, so
                // stale values must not carry across modes.
                ...(detectedImagePricing !== current.imagePricing
                    ? {
                          promptTextPrice: "",
                          promptImagePrice: "",
                          completionImagePrice: "",
                      }
                    : {}),
            }));
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

    // Pricing is only meaningful once the model leaves private — keyed off the
    // LIVE form value so flipping Visibility to App or Public in place reveals
    // the test + pricing section immediately. Private models carry no pricing
    // (owner is the only caller).
    const isShared = form.visibility !== "private";
    const returnedFields = isShared
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
    const hasValidPerUserRpm = isValidPerUserRpm(form.perUserRpm);
    // First-time pricing of an external endpoint re-observes its billed
    // buckets, so it needs a successful test. A model already saved at a priced
    // visibility has server-validated pricing, so re-editing it (e.g. a price
    // or description tweak) does not force another test. Private models defer
    // pricing entirely. External endpoints always need a token to be callable
    // at all.
    const alreadyPriced = isEdit && endpoint?.visibility !== "private";
    const needsTest = isShared && !alreadyPriced;
    const testRequirementMet =
        testState.status === "success" && returnedFields.length > 0;
    const saveRequirementMet = needsTest
        ? testRequirementMet && (isEdit || hasToken)
        : isEdit || hasToken;
    // A saved model's eligible targets are computed server-side with the same
    // rule the update endpoint validates against, so every id offered can be
    // saved. Creating a model has no id to ask about yet, so it falls back to
    // the catalog filtered by modality alone and relies on the save error.
    const visibleFallbackOptions = [
        ...new Set([
            ...(fallbackCandidates ??
                fallbackOptions
                    .filter(
                        (option) =>
                            option.modality === form.modality &&
                            option.modelId !== endpoint?.modelId,
                    )
                    .map((option) => option.modelId)),
            // A target that has since become ineligible stays listed so editing
            // something else does not silently drop it.
            ...form.fallbackModelIds,
        ]),
    ].sort();
    // One row per chosen target plus an empty row to add the next, so the
    // order on screen is the order they are tried.
    const fallbackRows =
        form.fallbackModelIds.length < MAX_FALLBACK_TARGETS
            ? [...form.fallbackModelIds, ""]
            : form.fallbackModelIds;

    // Setting a row to "None" removes it and closes the gap.
    function setFallbackAt(index: number, modelId: string): void {
        setForm((current) => {
            const next = [...current.fallbackModelIds];
            if (modelId === "") next.splice(index, 1);
            else next[index] = modelId;
            return { ...current, fallbackModelIds: next };
        });
    }
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.title.trim() !== "" &&
        form.baseUrl.trim() !== "" &&
        hasValidVisiblePrices &&
        hasValidPerUserRpm &&
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
                    model.
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
                        <ButtonGroup aria-label="Modality">
                            {(["text", "image"] as const).map((modality) => (
                                <TabButton
                                    key={modality}
                                    active={form.modality === modality}
                                    disabled={isEdit}
                                    onClick={() =>
                                        updateForm("modality", modality)
                                    }
                                    size="sm"
                                    className="min-w-20 gap-1.5 capitalize"
                                >
                                    {form.modality === modality && (
                                        <CheckIcon className="h-3.5 w-3.5" />
                                    )}
                                    {modality}
                                </TabButton>
                            ))}
                        </ButtonGroup>
                    </FieldStack>

                    <ModelListingFields
                        form={form}
                        modality={form.modality}
                        canPublish={canPublish}
                        isAgent={false}
                        onChange={(key, value) => updateForm(key, value)}
                        onInputModalitiesChange={(inputModalities) =>
                            setForm((current) => ({
                                ...current,
                                inputModalities,
                            }))
                        }
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <FieldStack
                            label="Endpoint URL"
                            helper="OpenAI-compatible /v1 base URL, or full chat/image generation/edit URL."
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
                            <EditableCombobox
                                name="community-upstream-id"
                                value={form.upstreamModel}
                                options={modelOptions}
                                placeholder={
                                    form.modality === "image"
                                        ? "gpt-image-2"
                                        : "gpt-4o-mini"
                                }
                                align="end"
                                open={providerModelMenuOpen}
                                onOpenChange={setProviderModelMenuOpen}
                                emptyMessage="No fetched models match."
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                onChange={(value) =>
                                    updateForm("upstreamModel", value)
                                }
                            />
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
                        {testState.status === "success" &&
                            testState.message && (
                                <p className="text-sm text-theme-text-muted">
                                    {testState.message}
                                </p>
                            )}
                    </div>
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
                    {isShared && (
                        <FieldStack
                            label="Fallback models"
                            helper={`Optional. Tried in order when this model's upstream fails, up to ${MAX_FALLBACK_TARGETS}. Each must be another community model of the same modality — public, or one of yours — priced at or below this one.`}
                            alignLabelRow
                        >
                            <div className="flex flex-col gap-2">
                                {fallbackRows.map((selected, index) => (
                                    <Dropdown
                                        key={selected || "new-fallback"}
                                        align="start"
                                        className="w-[var(--reference-width)] min-w-0 p-1"
                                        trigger={(open) => (
                                            <Button
                                                type="button"
                                                aria-label={`Fallback model ${index + 1}: ${selected || "None"}`}
                                                className="w-full min-w-0 self-stretch justify-between gap-2"
                                            >
                                                <span className="min-w-0 truncate font-mono text-sm">
                                                    {selected ||
                                                        (index === 0
                                                            ? "None"
                                                            : "None (remove)")}
                                                </span>
                                                <ChevronIcon
                                                    expanded={open}
                                                    className="h-4 w-4 shrink-0"
                                                />
                                            </Button>
                                        )}
                                    >
                                        {(close) => (
                                            <ScrollArea className="max-h-64">
                                                <DropdownItem
                                                    onClick={() => {
                                                        setFallbackAt(
                                                            index,
                                                            "",
                                                        );
                                                        close();
                                                    }}
                                                >
                                                    {index === 0
                                                        ? "None"
                                                        : "None (remove)"}
                                                </DropdownItem>
                                                {visibleFallbackOptions
                                                    .filter(
                                                        (modelId) =>
                                                            modelId ===
                                                                selected ||
                                                            !form.fallbackModelIds.includes(
                                                                modelId,
                                                            ),
                                                    )
                                                    .map((modelId) => (
                                                        <DropdownItem
                                                            key={modelId}
                                                            className={
                                                                modelId ===
                                                                selected
                                                                    ? "bg-theme-bg-active text-theme-text-strong"
                                                                    : undefined
                                                            }
                                                            onClick={() => {
                                                                setFallbackAt(
                                                                    index,
                                                                    modelId,
                                                                );
                                                                close();
                                                            }}
                                                        >
                                                            <span className="truncate font-mono">
                                                                {modelId}
                                                            </span>
                                                        </DropdownItem>
                                                    ))}
                                            </ScrollArea>
                                        )}
                                    </Dropdown>
                                ))}
                            </div>
                        </FieldStack>
                    )}
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
                              : form.visibility === "public"
                                ? "Publish Model"
                                : form.visibility === "app"
                                  ? "Add App Model"
                                  : "Add Private Model"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
