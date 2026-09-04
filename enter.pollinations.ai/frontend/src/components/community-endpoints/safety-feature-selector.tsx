import {
    ButtonGroup,
    CheckIcon,
    FieldStack,
    TabButton,
} from "@pollinations/ui";
import { SAFETY_FEATURES, type SafetyFeature } from "@shared/schemas/safety.ts";

const SAFETY_LABELS: Record<SafetyFeature, string> = {
    privacy: "Personal data",
    secrets: "Secrets",
    sexual: "Sexual content",
    violence: "Violence & hate",
    shield: "Prompt attacks",
};

export function SafetyFeatureSelector({
    value,
    disabled = false,
    onChange,
}: {
    value: SafetyFeature[];
    disabled?: boolean;
    onChange: (value: SafetyFeature[]) => void;
}) {
    function toggle(feature: SafetyFeature): void {
        const selected = new Set(value);
        if (selected.has(feature)) selected.delete(feature);
        else selected.add(feature);
        onChange(SAFETY_FEATURES.filter((item) => selected.has(item)));
    }

    return (
        <FieldStack
            label="Prompt safety"
            helper="Always apply selected checks before prompts reach this model. Personal data is redacted; other matches are blocked. Callers cannot turn these checks off."
            alignLabelRow
        >
            <ButtonGroup aria-label="Required prompt safety checks">
                {SAFETY_FEATURES.map((feature) => {
                    const selected = value.includes(feature);
                    return (
                        <TabButton
                            key={feature}
                            size="sm"
                            active={selected}
                            disabled={disabled}
                            className="gap-1.5"
                            onClick={() => toggle(feature)}
                        >
                            {selected && <CheckIcon className="h-3.5 w-3.5" />}
                            {SAFETY_LABELS[feature]}
                        </TabButton>
                    );
                })}
            </ButtonGroup>
        </FieldStack>
    );
}
