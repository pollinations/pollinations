import type { FC } from "react";
import { cn } from "@/util.ts";
import {
    getPermissionUiTheme,
    type PermissionUiTheme,
} from "./permission-ui.ts";

const SAFETY_FEATURES = [
    {
        id: "privacy",
        label: "Privacy",
        description: "redacts emails, names, phones, IPs",
    },
    {
        id: "secrets",
        label: "Secrets",
        description: "redacts api keys, passwords, tokens",
    },
    {
        id: "sexual",
        label: "Sexual",
        description: "blocks nudity and sexual content",
    },
    {
        id: "violence",
        label: "Violence",
        description: "blocks gore, hate, insults",
    },
] as const;

interface SafetyInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    theme?: PermissionUiTheme;
}

function parseFeatures(value: string): Set<string> {
    if (!value) return new Set();
    return new Set(
        value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    );
}

function serializeFeatures(features: Set<string>): string {
    return [...features].join(",");
}

export const SafetyInput: FC<SafetyInputProps> = ({
    value,
    onChange,
    disabled,
    theme = "violet",
}) => {
    const active = parseFeatures(value);
    const { row: rowTheme } = getPermissionUiTheme(theme);

    function toggle(featureId: string) {
        const next = new Set(active);
        if (next.has(featureId)) {
            next.delete(featureId);
        } else {
            next.add(featureId);
        }
        onChange(serializeFeatures(next));
    }

    return (
        <div>
            <div className="text-sm font-semibold mb-4">Safety</div>
            <div className="space-y-4">
                {SAFETY_FEATURES.map((feature) => {
                    const isActive = active.has(feature.id);
                    return (
                        <div key={feature.id}>
                            {/* biome-ignore lint/a11y/useSemanticElements: matches Profile/Usage row pattern */}
                            <div
                                role="button"
                                tabIndex={disabled ? -1 : 0}
                                aria-pressed={isActive}
                                aria-label={`Toggle ${feature.label} safety feature`}
                                onClick={() => toggle(feature.id)}
                                onKeyDown={(event) => {
                                    if (disabled) return;
                                    if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                    ) {
                                        event.preventDefault();
                                        toggle(feature.id);
                                    }
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
                                    isActive
                                        ? rowTheme.selectedClasses
                                        : "border-gray-200",
                                    rowTheme.focusRingClasses,
                                    !disabled &&
                                        (isActive
                                            ? rowTheme.selectedHoverClasses
                                            : rowTheme.rowHoverClasses),
                                    !disabled && "cursor-pointer",
                                    disabled && "opacity-50 cursor-not-allowed",
                                )}
                            >
                                <div className="flex flex-1 items-baseline gap-1">
                                    <span className="text-sm font-medium">
                                        {feature.label}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        – {feature.description}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
