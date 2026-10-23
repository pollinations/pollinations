import {
    ButtonGroup,
    CheckIcon,
    Field,
    Input,
    TabButton,
} from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import {
    COMMUNITY_ENDPOINT_CAPABILITIES,
    COMMUNITY_MODALITY_SPEC,
    type CommunityEndpointCapability,
    type CommunityEndpointModality,
} from "@shared/community-endpoints.ts";
import type { ModelInputModality } from "@shared/registry/registry.ts";
import { ModelFormRow } from "./model-form-row.tsx";
import type { ModelListingFormState } from "./types.ts";

const CAPABILITY_LABEL: Record<CommunityEndpointCapability, string> = {
    tool_calling: "Tool calling",
    reasoning: "Reasoning",
};
export function ModelCapabilityFields({
    form,
    modality,
    disabled,
    onModalityChange,
    onChange,
    onInputModalitiesChange,
    onCapabilitiesChange,
}: {
    form: ModelListingFormState;
    modality: CommunityEndpointModality;
    disabled: boolean;
    onModalityChange: (value: CommunityEndpointModality) => void;
    onChange: (key: "contextLength", value: string) => void;
    onInputModalitiesChange: (value: ModelInputModality[]) => void;
    onCapabilitiesChange: (value: CommunityEndpointCapability[]) => void;
}) {
    function toggleInputModality(input: ModelInputModality): void {
        const selected = form.inputModalities.includes(input);
        if (selected && form.inputModalities.length === 1) return;
        const next = new Set(form.inputModalities);
        if (selected) next.delete(input);
        else next.add(input);
        onInputModalitiesChange(
            COMMUNITY_MODALITY_SPEC[modality].inputModalities.filter((value) =>
                next.has(value),
            ),
        );
    }

    function toggleCapability(capability: CommunityEndpointCapability): void {
        const next = new Set(form.capabilities);
        if (next.has(capability)) next.delete(capability);
        else next.add(capability);
        onCapabilitiesChange(
            COMMUNITY_ENDPOINT_CAPABILITIES.filter((value) => next.has(value)),
        );
    }

    const canAdvertise = modality === "text";
    return (
        <div className="space-y-3">
            <ModelFormRow
                label="Modality"
                help={
                    disabled
                        ? "Existing models keep their registered modality."
                        : "Choose the API this endpoint serves."
                }
            >
                <ButtonGroup aria-label="Modality">
                    {(
                        [
                            "text",
                            "image",
                            "video",
                            "transcription",
                            "speech",
                            "embedding",
                        ] as const
                    ).map((option) => (
                        <TabButton
                            key={option}
                            active={modality === option}
                            disabled={disabled}
                            onClick={() => onModalityChange(option)}
                            size="sm"
                            className="min-w-20 gap-1.5 capitalize"
                        >
                            {modality === option && (
                                <CheckIcon className="h-3.5 w-3.5" />
                            )}
                            {option}
                        </TabButton>
                    ))}
                </ButtonGroup>
            </ModelFormRow>
            <ModelFormRow
                label="Accepted inputs"
                help="Select every input type supported by this model. At least one is required."
            >
                <ul
                    aria-label="Accepted input modalities"
                    className="flex flex-wrap gap-x-5 gap-y-2"
                >
                    {COMMUNITY_MODALITY_SPEC[modality].inputModalities.map(
                        (input) => (
                            <AuthAccessItem
                                key={input}
                                checked={form.inputModalities.includes(input)}
                                onChange={() => toggleInputModality(input)}
                            >
                                <span className="capitalize">{input}</span>
                            </AuthAccessItem>
                        ),
                    )}
                </ul>
            </ModelFormRow>
            {canAdvertise && (
                <ModelFormRow
                    label="Capabilities"
                    help="Optional catalog claims about the upstream model."
                >
                    <ul
                        aria-label="Advertised capabilities"
                        className="flex flex-wrap gap-x-5 gap-y-2"
                    >
                        {COMMUNITY_ENDPOINT_CAPABILITIES.map((capability) => (
                            <AuthAccessItem
                                key={capability}
                                checked={form.capabilities.includes(capability)}
                                onChange={() => toggleCapability(capability)}
                            >
                                {CAPABILITY_LABEL[capability]}
                            </AuthAccessItem>
                        ))}
                    </ul>
                </ModelFormRow>
            )}
            {canAdvertise && (
                <ModelFormRow
                    label="Context length"
                    help="Context window in tokens. Leave blank to advertise none."
                >
                    <Field.Input asChild>
                        <Input
                            name="community-model-context-length"
                            className="w-full min-w-0"
                            type="number"
                            min="1"
                            step="1"
                            value={form.contextLength}
                            placeholder="Not advertised"
                            hideNumberSteppers
                            onChange={(event) =>
                                onChange("contextLength", event.target.value)
                            }
                        />
                    </Field.Input>
                </ModelFormRow>
            )}
        </div>
    );
}
