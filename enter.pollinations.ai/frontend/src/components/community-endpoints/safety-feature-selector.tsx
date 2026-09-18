import { FieldStack, Text } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { SAFETY_FEATURES, type SafetyFeature } from "@shared/schemas/safety.ts";

const SAFETY_OPTIONS: Record<
    SafetyFeature,
    { label: string; description: string }
> = {
    privacy: {
        label: "Personal data",
        description: "Redact detected personal information from prompts.",
    },
    secrets: {
        label: "Secrets",
        description:
            "Block prompts containing detected credentials or financial details.",
    },
    sexual: {
        label: "Sexual content",
        description: "Block prompts flagged for sexual content.",
    },
    violence: {
        label: "Violence & hate",
        description: "Block prompts flagged for violence, hate, or insults.",
    },
    shield: {
        label: "Prompt attacks",
        description: "Block prompts flagged for prompt attacks or misconduct.",
    },
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
            helper="Selected checks run before prompts reach the model. Callers cannot turn them off."
        >
            <ul
                aria-label="Required prompt safety checks"
                className="space-y-3"
            >
                {SAFETY_FEATURES.map((feature) => (
                    <AuthAccessItem
                        key={feature}
                        checked={value.includes(feature)}
                        disabled={disabled}
                        onChange={() => toggle(feature)}
                        details={
                            <Text size="xs" tone="muted">
                                {SAFETY_OPTIONS[feature].description}
                            </Text>
                        }
                    >
                        {SAFETY_OPTIONS[feature].label}
                    </AuthAccessItem>
                ))}
            </ul>
        </FieldStack>
    );
}
