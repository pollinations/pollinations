import {
    Alert,
    Button,
    ButtonGroup,
    ChevronIcon,
    Dialog,
    DialogTitle,
    Dropdown,
    DropdownItem,
    FieldStack,
    Input,
    ScrollArea,
    TabButton,
    Textarea,
} from "@pollinations/ui";
import { ModalityTab } from "@pollinations/ui/gen";
import {
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    type CommunityEndpointVisibility,
} from "@shared/community-endpoints.ts";
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
                // The detected mode changes what the shared image price keys
                // mean (per image ↔ per 1M tokens), so stale entries reset.
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

    // Pricing is only meaningful when the model is (or is being made) public —
    // keyed off the LIVE form value so flipping Visibility to Public in place
    // reveals the test + pricing section immediately. Private models carry no
    // pricing (owner is the only caller).
    const isShared = form.visibility === "public";
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
    // First-time publishing of an external endpoint re-observes its billed
    // buckets, so it needs a successful test. A model already saved as public
    // has server-validated pricing, so re-editing it (e.g. a price or
    // description tweak) does not force another test. Private models defer
    // pricing entirely. External endpoints always need a token to be callable
    // at all.
    const alreadyPublic = isEdit && endpoint?.visibility === "public";
    const needsTest = isShared && !alreadyPublic;
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
    const canSubmit =
        !isSubmitting &&
        form.name.trim() !== "" &&
        form.title.trim() !== "" &&
        form.baseUrl.trim() !== "" &&
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
                        <ButtonGroup aria-label="Model modality">
                            {(["text", "image"] as const).map((modality) => {
                                return (
                                    <ModalityTab
                                        key={modality}
                                        active={form.modality === modality}
                                        disabled={isEdit}
                                        size="sm"
                                        className="min-w-24"
                                        onClick={() =>
                                            updateForm("modality", modality)
                                        }
                                    >
                                        {modality === "image"
                                            ? "Image"
                                            : "Text"}
                                    </ModalityTab>
                                );
                            })}
                        </ButtonGroup>
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
                            label="Title"
                            helper={`Shown as the model name. Up to ${COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH} characters.`}
                            alignLabelRow
                        >
                            <Input
                                name="community-model-title"
                                value={form.title}
                                placeholder="Fast Coding Model"
                                autoComplete="off"
                                maxLength={COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH}
                                required
                                onChange={(e) =>
                                    updateForm("title", e.target.value)
                                }
                            />
                        </FieldStack>
                    </div>

                    <FieldStack
                        label="Description"
                        helper={`Shown below the title in the Models list. Up to ${COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH} characters.`}
                        alignLabelRow
                    >
                        <Textarea
                            name="community-model-description"
                            value={form.description}
                            placeholder="Fast coding model with a long context window."
                            autoComplete="off"
                            maxLength={
                                COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH
                            }
                            rows={4}
                            onChange={(e) =>
                                updateForm("description", e.target.value)
                            }
                        />
                    </FieldStack>

                    <FieldStack
                        label="Visibility"
                        helper={
                            isShared
                                ? "Public: listed in /models and callable by anyone. Set optional usage prices below, or leave them at 0 for free."
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
                                className="min-w-24"
                            >
                                Private
                            </TabButton>
                            <TabButton
                                active={form.visibility === "public"}
                                disabled={!canPublish}
                                onClick={() => updateVisibility("public")}
                                size="sm"
                                className="min-w-24"
                            >
                                Public
                            </TabButton>
                        </ButtonGroup>
                    </FieldStack>

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
                                            form.baseUrl.trim() === "" ||
                                            modelListState.status === "loading"
                                        }
                                        onClick={() => void handleFetchModels()}
                                    >
                                        {modelListState.status === "loading"
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
                              : isShared
                                ? "Publish Model"
                                : "Add Private Model"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
