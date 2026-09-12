import {
    ButtonGroup,
    CheckIcon,
    Field,
    FieldStack,
    InlineLink,
    Input,
    TabButton,
} from "@pollinations/ui";
import {
    COMMUNITY_ENDPOINT_CAPABILITIES,
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    COMMUNITY_MODALITY_SPEC,
    type CommunityEndpointCapability,
    type CommunityEndpointModality,
} from "@shared/community-endpoints.ts";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import type { ModelListingFormState } from "./types.ts";

type ListingTextField =
    | "name"
    | "title"
    | "description"
    | "visibility"
    | "perUserRpm"
    | "contextLength";

const CAPABILITY_LABEL: Record<CommunityEndpointCapability, string> = {
    tool_calling: "Tool calling",
    reasoning: "Reasoning",
};

export function ModelListingFields({
    form,
    modality,
    canPublish,
    isAgent,
    allowPerUserRpm,
    required = true,
    onChange,
    onInputModalitiesChange,
    onCapabilitiesChange,
}: {
    form: ModelListingFormState;
    modality: CommunityEndpointModality;
    canPublish: boolean;
    isAgent: boolean;
    allowPerUserRpm: boolean;
    required?: boolean;
    onChange: (key: ListingTextField, value: string) => void;
    onInputModalitiesChange?: (value: ModelInputModality[]) => void;
    onCapabilitiesChange?: (value: CommunityEndpointCapability[]) => void;
}) {
    function toggleInputModality(input: ModelInputModality): void {
        const selected = form.inputModalities.includes(input);
        if (selected && form.inputModalities.length === 1) return;
        const next = new Set(form.inputModalities);
        if (selected) next.delete(input);
        else next.add(input);
        onInputModalitiesChange?.(
            COMMUNITY_MODALITY_SPEC[modality].inputModalities.filter((value) =>
                next.has(value),
            ),
        );
    }

    function toggleCapability(capability: CommunityEndpointCapability): void {
        const next = new Set(form.capabilities);
        if (next.has(capability)) next.delete(capability);
        else next.add(capability);
        onCapabilitiesChange?.(
            COMMUNITY_ENDPOINT_CAPABILITIES.filter((value) => next.has(value)),
        );
    }

    const isPublic = form.visibility === "public";
    const canAdvertise = modality === "text";

    return (
        <div className="space-y-3">
            {!isAgent && (
                <FieldStack
                    label="Accepted inputs"
                    helper="Select supported inputs. At least one is required."
                    alignLabelRow
                >
                    <ButtonGroup aria-label="Accepted input modalities">
                        {COMMUNITY_MODALITY_SPEC[modality].inputModalities.map(
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
                        isAgent ? (
                            "Public ID: {username}/{id}."
                        ) : (
                            <>
                                Public ID: {"{username}"}/{"{model-id}"}.{" "}
                                <InlineLink
                                    href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_MODEL.md#model-names"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Naming tips
                                </InlineLink>
                                .
                            </>
                        )
                    }
                    alignLabelRow
                >
                    <Field.Input asChild>
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
                    </Field.Input>
                </FieldStack>
                <FieldStack label="Title" alignLabelRow>
                    <Field.Input asChild>
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
                    </Field.Input>
                </FieldStack>
            </div>

            <FieldStack
                label="Description"
                helper={
                    isAgent
                        ? "Optional. What the agent does."
                        : "Optional. What the model does."
                }
                alignLabelRow
            >
                <Field.Input asChild>
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
                </Field.Input>
            </FieldStack>

            <FieldStack
                label="Visibility"
                helper={
                    isPublic
                        ? isAgent
                            ? "Listed in /models. Calls use the caller's Pollen and API permissions."
                            : "Listed in /models. Set prices below, or leave them at 0 for free."
                        : canPublish
                          ? "Only you can use it."
                          : "Only you can use it. Public publishing requires approval."
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

            {!isAgent && canAdvertise && (
                <FieldStack
                    label="Capabilities"
                    helper="Optional catalog claims about the upstream model."
                    alignLabelRow
                >
                    <ButtonGroup aria-label="Advertised capabilities">
                        {COMMUNITY_ENDPOINT_CAPABILITIES.map((capability) => {
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

            {!isAgent && canAdvertise && (
                <FieldStack
                    label="Context length (optional)"
                    helper="Context window in tokens. Leave blank to advertise none."
                    alignLabelRow
                >
                    <Field.Input asChild>
                        <Input
                            name="community-model-context-length"
                            type="number"
                            min="1"
                            step="1"
                            value={form.contextLength}
                            placeholder="Not advertised"
                            onChange={(event) =>
                                onChange("contextLength", event.target.value)
                            }
                        />
                    </Field.Input>
                </FieldStack>
            )}

            {allowPerUserRpm && (
                <FieldStack
                    label="Per-user RPM"
                    helper="Optional. Maximum requests each Pollinations user can send per minute. Decimals are supported (0.5 = one request every 2 minutes). Leave blank for no Pollinations-side limit."
                >
                    <Field.Input asChild>
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
                    </Field.Input>
                </FieldStack>
            )}
        </div>
    );
}
