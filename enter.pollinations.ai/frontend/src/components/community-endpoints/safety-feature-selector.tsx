import { InfoTip } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { SAFETY_FEATURES, type SafetyFeature } from "@shared/schemas/safety.ts";

const SAFETY_OPTIONS: Record<
    SafetyFeature,
    { label: string; description: string }
> = {
    privacy: {
        label: "Redact personal data",
        description: "Redact detected personal information from prompts.",
    },
    secrets: {
        label: "Block secrets",
        description:
            "Block prompts containing detected credentials or financial details.",
    },
    sexual: {
        label: "Block sexual content",
        description: "Block prompts flagged for sexual content.",
    },
    violence: {
        label: "Block violence & hate",
        description: "Block prompts flagged for violence, hate, or insults.",
    },
    shield: {
        label: "Block prompt attacks",
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
        <div className="space-y-3">
            <div className="flex items-center">
                <p className="font-body text-sm font-semibold leading-5 text-theme-text-strong">
                    Prompt safety
                </p>
                <InfoTip
                    text="Always apply selected checks before prompts reach this model. Personal data is redacted; other matches are blocked. Callers cannot turn these checks off."
                    label="Prompt safety information"
                />
            </div>
            <ul
                aria-label="Required prompt safety checks"
                className="grid gap-x-4 gap-y-3"
                style={{
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
                }}
            >
                {SAFETY_FEATURES.map((feature) => (
                    <AuthAccessItem
                        key={feature}
                        checked={value.includes(feature)}
                        disabled={disabled}
                        onChange={() => toggle(feature)}
                        info={
                            <InfoTip
                                text={SAFETY_OPTIONS[feature].description}
                                label={`${SAFETY_OPTIONS[feature].label} information`}
                            />
                        }
                    >
                        {SAFETY_OPTIONS[feature].label}
                    </AuthAccessItem>
                ))}
            </ul>
        </div>
    );
}
