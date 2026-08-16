import {
    ButtonGroup,
    CheckIcon,
    FieldStack,
    Input,
    TabButton,
} from "@pollinations/ui";
import {
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_INPUT_MODALITIES,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
    COMMUNITY_ENDPOINT_VISIBILITIES,
    type CommunityEndpointModality,
} from "@shared/community-endpoints.ts";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import { type ModelListingFormState, VISIBILITY_LABELS } from "./types.ts";

type ListingTextField =
    | "name"
    | "title"
    | "description"
    | "visibility"
    | "perUserRpm";

export function ModelListingFields({
    form,
    modality,
    canPublish,
    isAgent,
    required = true,
    onChange,
    onInputModalitiesChange,
}: {
    form: ModelListingFormState;
    modality: CommunityEndpointModality;
    canPublish: boolean;
    isAgent: boolean;
    required?: boolean;
    onChange: (key: ListingTextField, value: string) => void;
    onInputModalitiesChange?: (value: ModelInputModality[]) => void;
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
                    form.visibility === "private"
                        ? "Private: callable only by you and shown only in model lists authenticated with your API key."
                        : form.visibility === "app"
                          ? isAgent
                              ? "App: kept out of the public catalog and callable by API keys issued through your apps. Calls use the caller's Pollinations balance and API-key permissions."
                              : "App: kept out of the public catalog and callable by API keys issued through your apps. Anyone who authorizes through one of your apps can call it — set prices below, or leave them at 0 for free."
                          : isAgent
                            ? "Public: listed in /models and callable by anyone. Calls use the caller's Pollinations balance and API-key permissions."
                            : "Public: listed in /models and callable by anyone. Set optional prices below, or leave them at 0 for free."
                }
                alignLabelRow
            >
                <ButtonGroup aria-label="Model visibility">
                    {COMMUNITY_ENDPOINT_VISIBILITIES.map((visibility) => {
                        const active = form.visibility === visibility;
                        return (
                            <TabButton
                                key={visibility}
                                active={active}
                                // Only public listing needs approval; private
                                // and app are open to every account.
                                disabled={
                                    visibility === "public" && !canPublish
                                }
                                onClick={() =>
                                    onChange("visibility", visibility)
                                }
                                size="sm"
                                className="min-w-24 gap-1.5"
                            >
                                {active && (
                                    <CheckIcon className="h-3.5 w-3.5" />
                                )}
                                {VISIBILITY_LABELS[visibility]}
                            </TabButton>
                        );
                    })}
                </ButtonGroup>
                {!canPublish && (
                    <p className="text-sm text-theme-text-muted">
                        Listing publicly requires approval. Private and app
                        models need none.
                    </p>
                )}
            </FieldStack>

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
