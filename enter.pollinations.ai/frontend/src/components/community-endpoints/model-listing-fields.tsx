import {
    ButtonGroup,
    CheckIcon,
    FieldStack,
    Input,
    TabButton,
} from "@pollinations/ui";
import {
    COMMUNITY_ADVERTISED_FIELDS,
    COMMUNITY_ENDPOINT_CAPABILITIES,
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_INPUT_MODALITIES,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    type CommunityEndpointModality,
} from "@shared/community-endpoints.ts";
import type { ModelDefinitionCapability } from "@shared/registry/model-info.ts";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import type { ModelListingFormState } from "./types.ts";

type ListingTextField =
    | "name"
    | "title"
    | "description"
    | "visibility"
    | "perUserRpm"
    | "contextLength"
    | "maxReferenceImages";

const CAPABILITY_LABEL: Record<ModelDefinitionCapability, string> = {
    tool_calling: "Tool calling",
    reasoning: "Reasoning",
    web_search: "Web search",
    code_execution: "Code execution",
};

export function ModelListingFields({
    form,
    modality,
    canPublish,
    isAgent,
    required = true,
    onChange,
    onInputModalitiesChange,
    onCapabilitiesChange,
}: {
    form: ModelListingFormState;
    modality: CommunityEndpointModality;
    canPublish: boolean;
    isAgent: boolean;
    required?: boolean;
    onChange: (key: ListingTextField, value: string) => void;
    onInputModalitiesChange?: (value: ModelInputModality[]) => void;
    onCapabilitiesChange?: (value: ModelDefinitionCapability[]) => void;
}) {
    function toggleInputModality(input: ModelInputModality): void {
        const selected = form.inputModalities.includes(input);
        if (selected && form.inputModalities.length === 1) return;
        const next = new Set(form.inputModalities);
        if (selected) next.delete(input);
        else next.add(input);
        onInputModalitiesChange?.(
            COMMUNITY_ENDPOINT_INPUT_MODALITIES[modality].filter((value) =>
                next.has(value),
            ),
        );
    }

    function toggleCapability(capability: ModelDefinitionCapability): void {
        const next = new Set(form.capabilities);
        if (next.has(capability)) next.delete(capability);
        else next.add(capability);
        onCapabilitiesChange?.(
            declarableCapabilities.filter((value) => next.has(value)),
        );
    }

    const isPublic = form.visibility === "public";
    // Empty for image and transcription endpoints, which advertise none.
    const declarableCapabilities: readonly ModelDefinitionCapability[] =
        COMMUNITY_ENDPOINT_CAPABILITIES[modality];
    // Shown only where a declaration would mean something, using the same
    // table the API rejects against, so the form never offers a field whose
    // value the server would refuse.
    const canDeclare = (field: keyof typeof COMMUNITY_ADVERTISED_FIELDS) =>
        COMMUNITY_ADVERTISED_FIELDS[field].supported(
            modality,
            form.inputModalities,
        );

    return (
        <>
            {!isAgent && (
                <FieldStack
                    label="Accepted inputs"
                    helper="Select every input type supported by this model. At least one is required."
                    alignLabelRow
                >
                    <ButtonGroup aria-label="Accepted input modalities">
                        {COMMUNITY_ENDPOINT_INPUT_MODALITIES[modality].map(
                            (input) => {
                                const selected =
                                    form.inputModalities.includes(input);
                                return (
                                    <TabButton
                                        key={input}
                                        active={selected}
                                        onClick={() =>
                                            toggleInputModality(input)
                                        }
                                        size="sm"
                                        className="min-w-20 gap-1.5 capitalize"
                                    >
                                        {selected && (
                                            <CheckIcon className="h-3.5 w-3.5" />
                                        )}
                                        {input}
                                    </TabButton>
                                );
                            },
                        )}
                    </ButtonGroup>
                </FieldStack>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <FieldStack
                    label={isAgent ? "ID" : "Model ID"}
                    helper={
                        isAgent
                            ? "Public ID: {username}/{id}."
                            : "Public ID: {username}/{model-id}."
                    }
                    alignLabelRow
                >
                    <Input
                        name="community-model-name"
                        value={form.name}
                        placeholder={isAgent ? "my-agent" : "my-model"}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        required={required}
                        onChange={(event) =>
                            onChange("name", event.target.value)
                        }
                    />
                </FieldStack>
                <FieldStack
                    label="Title"
                    helper="Display name shown in the Models list."
                    alignLabelRow
                >
                    <Input
                        name="community-model-title"
                        value={form.title}
                        placeholder={isAgent ? "My Agent" : "My Model"}
                        autoComplete="off"
                        maxLength={COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH}
                        required={required}
                        onChange={(event) =>
                            onChange("title", event.target.value)
                        }
                    />
                </FieldStack>
            </div>

            <FieldStack
                label="Description"
                helper="Optional. One line about what the model is good at."
                alignLabelRow
            >
                <Input
                    name="community-model-description"
                    value={form.description}
                    placeholder={
                        isAgent
                            ? "Research assistant with web tools"
                            : "Fast coding model, long context"
                    }
                    autoComplete="off"
                    maxLength={COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH}
                    onChange={(event) =>
                        onChange("description", event.target.value)
                    }
                />
            </FieldStack>

            <FieldStack
                label="Visibility"
                helper={
                    isPublic
                        ? isAgent
                            ? "Public: listed in /models and callable by anyone. Calls use the caller's Pollinations balance and API-key permissions."
                            : "Public: listed in /models and callable by anyone. Set optional prices below, or leave them at 0 for free."
                        : canPublish
                          ? "Private: callable only by you and shown only in model lists authenticated with your API key."
                          : "Private: callable only by you. Publishing publicly requires approval."
                }
                alignLabelRow
            >
                <ButtonGroup aria-label="Model visibility">
                    <TabButton
                        active={!isPublic}
                        onClick={() => onChange("visibility", "private")}
                        size="sm"
                        className="min-w-24 gap-1.5"
                    >
                        {!isPublic && <CheckIcon className="h-3.5 w-3.5" />}
                        Private
                    </TabButton>
                    <TabButton
                        active={isPublic}
                        disabled={!canPublish}
                        onClick={() => onChange("visibility", "public")}
                        size="sm"
                        className="min-w-24 gap-1.5"
                    >
                        {isPublic && <CheckIcon className="h-3.5 w-3.5" />}
                        Public
                    </TabButton>
                </ButtonGroup>
            </FieldStack>

            {!isAgent && canDeclare("capabilities") && (
                <FieldStack
                    label="Capabilities"
                    helper="Optional. What the catalog advertises about this model. These describe the upstream — requests are forwarded unchanged either way, so only claim what it really does."
                    alignLabelRow
                >
                    <ButtonGroup aria-label="Advertised capabilities">
                        {declarableCapabilities.map((capability) => {
                            const selected =
                                form.capabilities.includes(capability);
                            return (
                                <TabButton
                                    key={capability}
                                    active={selected}
                                    onClick={() => toggleCapability(capability)}
                                    size="sm"
                                    className="gap-1.5"
                                >
                                    {selected && (
                                        <CheckIcon className="h-3.5 w-3.5" />
                                    )}
                                    {CAPABILITY_LABEL[capability]}
                                </TabButton>
                            );
                        })}
                    </ButtonGroup>
                </FieldStack>
            )}

            {!isAgent &&
                (canDeclare("contextLength") ||
                    canDeclare("maxReferenceImages")) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {canDeclare("contextLength") && (
                            <FieldStack
                                label="Context length"
                                helper="Optional. Context window in tokens."
                                alignLabelRow
                            >
                                <Input
                                    name="community-model-context-length"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={form.contextLength}
                                    placeholder="Not advertised"
                                    onChange={(event) =>
                                        onChange(
                                            "contextLength",
                                            event.target.value,
                                        )
                                    }
                                />
                            </FieldStack>
                        )}
                        {canDeclare("maxReferenceImages") && (
                            <FieldStack
                                label="Reference images"
                                helper="Optional. How many images the upstream accepts per request."
                                alignLabelRow
                            >
                                <Input
                                    name="community-model-max-reference-images"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={form.maxReferenceImages}
                                    placeholder="Not advertised"
                                    onChange={(event) =>
                                        onChange(
                                            "maxReferenceImages",
                                            event.target.value,
                                        )
                                    }
                                />
                            </FieldStack>
                        )}
                    </div>
                )}

            {!isAgent && (
                <FieldStack
                    label="Per-user RPM"
                    helper="Optional. Maximum requests each Pollinations user can send per minute. Decimals are supported (0.5 = one request every 2 minutes). Leave blank for no Pollinations-side limit."
                >
                    <Input
                        name="community-per-user-rpm"
                        type="number"
                        step="any"
                        value={form.perUserRpm}
                        placeholder="No limit"
                        onChange={(event) =>
                            onChange("perUserRpm", event.target.value)
                        }
                    />
                </FieldStack>
            )}
        </>
    );
}
