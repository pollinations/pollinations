import {
    Alert,
    BeakerIcon,
    Button,
    ButtonGroup,
    CheckIcon,
    ChevronIcon,
    DialogBody,
    DialogFooter,
    DialogHeader,
    Dropdown,
    DropdownItem,
    EditableCombobox,
    Field,
    FieldStack,
    InlineLink,
    Input,
    ScrollArea,
    TabButton,
    XIcon,
} from "@pollinations/ui";
import { AuthAccessItem, AuthInfoCard } from "@pollinations/ui/auth";
import { MAX_FALLBACK_TARGETS } from "@shared/community-endpoints.ts";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { genDocsUrl } from "../../config.ts";
import { ResourceDialog } from "../layout/resource-dialog.tsx";
import { OpenWebUiLink } from "../models/open-webui-link.tsx";
import { ModelCapabilityFields } from "./model-capability-fields.tsx";
import { ModelListingFields } from "./model-listing-fields.tsx";
import {
    basePriceKeysForModality,
    formWithVisiblePrices,
    hasValidVisibleFormPrices,
    PriceGroups,
    returnedPriceFields,
    savedEndpointPriceKeys,
    visiblePriceFieldKeys,
} from "./price-table.tsx";
import { SafetyFeatureSelector } from "./safety-feature-selector.tsx";
import {
    type ActionState,
    type CommunityEndpointTestResponse,
    type EditableEndpoint,
    type EndpointFormState,
    type EndpointPayload,
    emptyForm,
    endpointToForm,
    type FallbackModelOption,
    idleAction,
    isValidPerUserRpm,
    nextFormState,
    openWebUiTestableModelId,
    providerModelHelper,
    readError,
    toEndpointPayload,
} from "./types.ts";

type CommunityEndpointDialogProps = {
    /** Present in edit mode (prefills the form); omit to create. */
    endpoint?: EditableEndpoint;
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
    const isEndpointAgent = endpoint?.type === "endpoint_agent";
    // Only in edit mode: a model being created has no id to open yet.
    const testableModelId = endpoint
        ? openWebUiTestableModelId(endpoint)
        : null;
    const [form, setForm] = useState<EndpointFormState>(emptyForm);
    const [rpmLimited, setRpmLimited] = useState(false);
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
        setRpmLimited(open && endpoint?.perUserRpm != null);
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
        if (!open || !endpointId || isEndpointAgent) return;
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
    }, [open, endpointId, isEndpointAgent]);

    const hasToken = form.bearerToken.trim().length > 0;
    const tokenForRequest = { bearerToken: form.bearerToken.trim() };
    const canFetchModels =
        form.modality !== "text" || form.api === "chat_completions";

    function updateForm(key: keyof EndpointFormState, value: string): void {
        setForm((current) => nextFormState(current, key, value));
        if (
            key === "modality" ||
            key === "name" ||
            key === "upstreamModel" ||
            key === "url" ||
            key === "api" ||
            key === "bearerToken"
        ) {
            setTestState(idleAction);
        }
        if (
            key === "modality" ||
            key === "url" ||
            key === "api" ||
            key === "bearerToken"
        ) {
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
                    baseUrl: form.url,
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
                json:
                    form.modality === "text"
                        ? {
                              modality: "text",
                              api: form.api,
                              url: form.url,
                              bearerToken: form.bearerToken.trim(),
                              model:
                                  form.upstreamModel.trim() || form.name.trim(),
                          }
                        : {
                              modality: form.modality,
                              baseUrl: form.url,
                              bearerToken: form.bearerToken.trim(),
                              ...(form.modality !== "video" && {
                                  model:
                                      form.upstreamModel.trim() ||
                                      form.name.trim(),
                              }),
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
                        : form.modality === "video"
                          ? "Endpoint responded, but did not return playable video"
                          : form.modality === "transcription"
                            ? "Endpoint responded, but did not return transcription text or usage"
                            : form.modality === "speech"
                              ? "Endpoint responded, but did not return binary audio"
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

    // Pricing is only meaningful when the model is (or is being made) public —
    // keyed off the LIVE form value so flipping Visibility to Public in place
    // reveals the test + pricing section immediately. Private models carry no
    // pricing (owner is the only caller).
    const isShared = form.visibility === "public" && !isEndpointAgent;
    const returnedFields = isShared
        ? returnedPriceFields(testState, form.modality, form.imagePricing)
        : [];
    // Reveal the modality's base price plus whatever the test observed or the
    // model already had saved. Blank and zero prices mean free.
    const basePriceKeys = basePriceKeysForModality(form.modality);
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
    const hasValidPerUserRpm =
        (!rpmLimited || form.perUserRpm.trim() !== "") &&
        isValidPerUserRpm(form.perUserRpm);
    const cancelsPendingChange =
        Boolean(endpoint?.pending) && form.visibility === "private";
    // First-time publishing of an external endpoint re-observes its billed
    // buckets, so it needs a successful test. A model already public or queued
    // for publication has server-validated pricing, so re-editing it does not
    // force another test. Private models defer pricing entirely. External
    // endpoints always need a token to be callable at all.
    const isPublicOrPending =
        isEdit &&
        (endpoint?.visibility === "public" ||
            endpoint?.pending?.visibility === "public");
    const needsTest = isShared && !isPublicOrPending;
    const testRequirementMet =
        testState.status === "success" && returnedFields.length > 0;
    const saveRequirementMet =
        isEndpointAgent ||
        (needsTest
            ? testRequirementMet && (isEdit || hasToken)
            : isEdit || hasToken);
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
            ...form.fallbacks,
        ]),
    ].sort();
    // One row per chosen target plus an empty row to add the next, so the
    // order on screen is the order they are tried.
    const fallbackRows =
        form.fallbacks.length < MAX_FALLBACK_TARGETS
            ? [...form.fallbacks, ""]
            : form.fallbacks;

    // Setting a row to "None" removes it and closes the gap.
    function setFallbackAt(index: number, modelId: string): void {
        setForm((current) => {
            const next = [...current.fallbacks];
            if (modelId === "") next.splice(index, 1);
            else next[index] = modelId;
            return { ...current, fallbacks: next };
        });
    }
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.title.trim() !== "" &&
        form.url.trim() !== "" &&
        hasValidVisiblePrices &&
        hasValidPerUserRpm &&
        saveRequirementMet;

    return (
        <ResourceDialog
            open={open}
            onOpenChange={onOpenChange}
            size="lg"
            trigger={trigger}
            triggerAsChild
        >
            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
                data-form-type="other"
            >
                <DialogBody scrollbar="subtle">
                    <DialogHeader
                        inBody
                        title={
                            isEndpointAgent
                                ? "Edit endpoint agent"
                                : isEdit
                                  ? "Edit model"
                                  : "Create model"
                        }
                        description={
                            <>
                                {isEndpointAgent
                                    ? "Update its listing and connection."
                                    : "Connect your endpoint to Pollinations."}
                                {!isEdit && (
                                    <>
                                        {" "}
                                        <InlineLink
                                            href={genDocsUrl(
                                                "#tag/publish-a-model",
                                            )}
                                        >
                                            Read the guide
                                        </InlineLink>
                                    </>
                                )}
                            </>
                        }
                    />
                    {error && <Alert intent="danger">{error}</Alert>}

                    {endpoint?.pending && (
                        <Alert intent="info" title="Changes queued">
                            This form shows the queued values. They take effect{" "}
                            {new Date(
                                endpoint.pending.effectiveAt,
                            ).toLocaleString()}
                            .
                        </Alert>
                    )}

                    {cancelsPendingChange && (
                        <Alert
                            intent="danger"
                            title="Queued changes will be cancelled"
                        >
                            Saving this model as Private removes its queued
                            changes. Publishing it again starts a new 3-hour
                            wait.
                        </Alert>
                    )}

                    <AuthInfoCard>
                        <div className="space-y-3">
                            <ModelListingFields
                                form={form}
                                canPublish={canPublish}
                                isAgent={isEndpointAgent}
                                onChange={(key, value) =>
                                    updateForm(key, value)
                                }
                            />
                        </div>
                    </AuthInfoCard>
                    {!isEndpointAgent && (
                        <AuthInfoCard>
                            <ModelCapabilityFields
                                form={form}
                                modality={form.modality}
                                disabled={isEdit}
                                onModalityChange={(modality) =>
                                    updateForm("modality", modality)
                                }
                                onChange={(key, value) =>
                                    updateForm(key, value)
                                }
                                onInputModalitiesChange={(inputModalities) =>
                                    setForm((current) => ({
                                        ...current,
                                        inputModalities,
                                    }))
                                }
                                onCapabilitiesChange={(capabilities) =>
                                    setForm((current) => ({
                                        ...current,
                                        capabilities,
                                    }))
                                }
                            />
                        </AuthInfoCard>
                    )}
                    {form.visibility === "public" && (
                        <Alert intent="warning" title="Public provider duties">
                            Requests are sent to your endpoint. You are
                            responsible for securing caller data and disclosing
                            how you retain, share, train on, or otherwise use
                            it.
                        </Alert>
                    )}

                    <AuthInfoCard>
                        <div className="space-y-3">
                            {form.modality === "text" && (
                                <FieldStack
                                    label="Upstream API"
                                    helper="Responses endpoints also work through Pollinations Chat Completions."
                                >
                                    <ButtonGroup aria-label="Upstream API">
                                        {(
                                            [
                                                [
                                                    "chat_completions",
                                                    "Chat Completions",
                                                ],
                                                ["responses", "Responses"],
                                            ] as const
                                        ).map(([api, label]) => (
                                            <TabButton
                                                key={api}
                                                active={form.api === api}
                                                onClick={() =>
                                                    updateForm("api", api)
                                                }
                                                size="sm"
                                                className="gap-1.5"
                                            >
                                                {form.api === api && (
                                                    <CheckIcon className="h-3.5 w-3.5" />
                                                )}
                                                {label}
                                            </TabButton>
                                        ))}
                                    </ButtonGroup>
                                </FieldStack>
                            )}

                            <div className="space-y-3">
                                <FieldStack
                                    label={
                                        form.modality === "video"
                                            ? "Video endpoint URL"
                                            : "Endpoint URL"
                                    }
                                    helper={
                                        form.modality === "text"
                                            ? "The exact URL called for the selected API."
                                            : form.modality === "video"
                                              ? "The exact URL Pollinations calls to generate a video."
                                              : "OpenAI-compatible /v1 base URL, or full image/edit/transcription/speech URL."
                                    }
                                >
                                    <Field.Input asChild>
                                        <Input
                                            name="community-endpoint-url"
                                            type="url"
                                            inputMode="url"
                                            value={form.url}
                                            placeholder={
                                                form.modality === "text"
                                                    ? `https://api.example.com/v1/${form.api === "responses" ? "responses" : "chat/completions"}`
                                                    : form.modality === "video"
                                                      ? "https://api.example.com/generate-video"
                                                      : "https://api.example.com/v1"
                                            }
                                            autoComplete="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            required
                                            onChange={(e) =>
                                                updateForm(
                                                    "url",
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </Field.Input>
                                </FieldStack>
                                {isEndpointAgent && (
                                    <FieldStack
                                        label="Agent model ID"
                                        helper="Model ID sent to the endpoint with each request."
                                    >
                                        <Field.Input asChild>
                                            <Input
                                                name="community-upstream-id"
                                                value={form.upstreamModel}
                                                autoComplete="off"
                                                autoCapitalize="none"
                                                spellCheck={false}
                                                required
                                                onChange={(event) =>
                                                    updateForm(
                                                        "upstreamModel",
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </Field.Input>
                                    </FieldStack>
                                )}
                                {!isEndpointAgent && (
                                    <FieldStack
                                        label="API bearer token"
                                        helper={
                                            isEdit
                                                ? "Leave blank to keep the saved token. Enter a token to fetch models, test, or replace it."
                                                : "Stored encrypted and sent as Authorization: Bearer to your endpoint."
                                        }
                                    >
                                        <Field.Input asChild>
                                            <Input
                                                name="community-api-bearer-token"
                                                type="password"
                                                value={form.bearerToken}
                                                placeholder={
                                                    isEdit
                                                        ? "Re-enter token"
                                                        : undefined
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
                                        </Field.Input>
                                    </FieldStack>
                                )}

                                {!isEndpointAgent &&
                                    form.modality !== "video" && (
                                        <FieldStack
                                            label="Provider model ID"
                                            helper={
                                                canFetchModels
                                                    ? providerModelHelper(
                                                          modelOptions,
                                                          modelListState,
                                                      )
                                                    : "Model ID sent to the Responses endpoint. Model discovery is not required."
                                            }
                                            action={
                                                canFetchModels && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        intent="info"
                                                        className="shrink-0 text-sm"
                                                        disabled={
                                                            !hasToken ||
                                                            form.url.trim() ===
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
                                                )
                                            }
                                        >
                                            <EditableCombobox
                                                name="community-upstream-id"
                                                value={form.upstreamModel}
                                                options={modelOptions}
                                                placeholder={
                                                    form.modality === "image"
                                                        ? "gpt-image-2"
                                                        : form.modality ===
                                                            "transcription"
                                                          ? "whisper-1"
                                                          : form.modality ===
                                                              "speech"
                                                            ? "kokoro"
                                                            : form.modality ===
                                                                "embedding"
                                                              ? "text-embedding-3-small"
                                                              : "gpt-4o-mini"
                                                }
                                                align="end"
                                                open={providerModelMenuOpen}
                                                onOpenChange={
                                                    setProviderModelMenuOpen
                                                }
                                                emptyMessage="No fetched models match."
                                                autoComplete="off"
                                                autoCapitalize="none"
                                                spellCheck={false}
                                                data-lpignore="true"
                                                data-1p-ignore="true"
                                                data-bwignore="true"
                                                onChange={(value) =>
                                                    updateForm(
                                                        "upstreamModel",
                                                        value,
                                                    )
                                                }
                                            />
                                        </FieldStack>
                                    )}
                            </div>

                            {!isEndpointAgent && (
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button
                                        type="button"
                                        intent="info"
                                        onClick={() => void handleTest()}
                                        disabled={
                                            !hasToken ||
                                            form.url.trim() === "" ||
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
                                    {testState.status === "success" &&
                                        testState.message && (
                                            <p className="text-sm text-theme-text-muted">
                                                {testState.message}
                                            </p>
                                        )}
                                </div>
                            )}
                        </div>
                    </AuthInfoCard>
                    {isShared && (
                        <AuthInfoCard>
                            <div className="space-y-3">
                                <PriceGroups
                                    form={form}
                                    modality={form.modality}
                                    imagePricing={form.imagePricing}
                                    testState={testState}
                                    visiblePriceKeys={visiblePriceKeys}
                                    onChange={updateForm}
                                />
                                <FieldStack
                                    label="Accepted Pollen"
                                    helper={
                                        form.paidOnly
                                            ? "Paid only: callers must spend Paid Pollen. Use this when your upstream bills per use, so free Quest Pollen cannot cover the price."
                                            : "Any Pollen: callers can pay with Quest or Paid Pollen."
                                    }
                                >
                                    <ButtonGroup aria-label="Accepted balance">
                                        <TabButton
                                            active={!form.paidOnly}
                                            onClick={() =>
                                                setForm((current) => ({
                                                    ...current,
                                                    paidOnly: false,
                                                }))
                                            }
                                            size="sm"
                                            className="min-w-24 gap-1.5"
                                        >
                                            {!form.paidOnly && (
                                                <CheckIcon className="h-3.5 w-3.5" />
                                            )}
                                            Any Pollen
                                        </TabButton>
                                        <TabButton
                                            active={form.paidOnly}
                                            onClick={() =>
                                                setForm((current) => ({
                                                    ...current,
                                                    paidOnly: true,
                                                }))
                                            }
                                            size="sm"
                                            className="min-w-24 gap-1.5"
                                        >
                                            {form.paidOnly && (
                                                <CheckIcon className="h-3.5 w-3.5" />
                                            )}
                                            Paid only
                                        </TabButton>
                                    </ButtonGroup>
                                </FieldStack>
                            </div>
                        </AuthInfoCard>
                    )}
                    <AuthInfoCard>
                        <ul>
                            <AuthAccessItem
                                checked={rpmLimited}
                                disabled={isSubmitting}
                                onChange={(checked) => {
                                    setRpmLimited(checked);
                                    if (!checked) updateForm("perUserRpm", "");
                                }}
                                details={
                                    rpmLimited ? (
                                        <div className="space-y-2">
                                            <Input
                                                name="community-per-user-rpm"
                                                aria-label="Requests per minute value"
                                                type="number"
                                                step="any"
                                                required
                                                disabled={isSubmitting}
                                                value={form.perUserRpm}
                                                onChange={(event) =>
                                                    updateForm(
                                                        "perUserRpm",
                                                        event.target.value,
                                                    )
                                                }
                                                className="w-[116px]"
                                                hideNumberSteppers
                                            />
                                            <p>
                                                Per user. Decimals allowed: 0.5
                                                means one request every 2
                                                minutes.
                                            </p>
                                        </div>
                                    ) : (
                                        "No limit."
                                    )
                                }
                            >
                                Requests per minute
                            </AuthAccessItem>
                        </ul>
                    </AuthInfoCard>
                    {!isEndpointAgent && (
                        <AuthInfoCard>
                            <SafetyFeatureSelector
                                value={form.requiredSafetyFeatures}
                                disabled={isSubmitting}
                                onChange={(requiredSafetyFeatures) =>
                                    setForm((current) => ({
                                        ...current,
                                        requiredSafetyFeatures,
                                    }))
                                }
                            />
                        </AuthInfoCard>
                    )}
                    {isShared && (
                        <AuthInfoCard>
                            <FieldStack
                                label="Fallback models"
                                helper={`Optional. Tried in order when this model's upstream fails, up to ${MAX_FALLBACK_TARGETS}. Each must be another public community model of the same modality, priced at or below this one.`}
                            >
                                <div className="flex flex-col gap-2">
                                    {fallbackRows.map((selected, index) => (
                                        <Dropdown
                                            key={selected || "new-fallback"}
                                            portalled={false}
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
                                                                !form.fallbacks.includes(
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
                        </AuthInfoCard>
                    )}
                    {testableModelId && (
                        <div className="mr-auto">
                            <OpenWebUiLink
                                modelId={testableModelId}
                                variant="text"
                            />
                        </div>
                    )}
                </DialogBody>
                <DialogFooter className="polli:bg-transparent">
                    <Button
                        icon={<XIcon />}
                        type="button"
                        intent="neutral"
                        className="disabled:opacity-50"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        icon={<BeakerIcon />}
                        type="submit"
                        intent="commit"
                        className="disabled:opacity-50"
                        disabled={!canSubmit}
                    >
                        {isSubmitting
                            ? "Saving…"
                            : isEdit
                              ? "Save changes"
                              : "Create model"}
                    </Button>
                </DialogFooter>
            </form>
        </ResourceDialog>
    );
}
