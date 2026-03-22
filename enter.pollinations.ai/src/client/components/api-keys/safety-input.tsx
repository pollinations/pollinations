import type { FC } from "react";
import { cn } from "@/util.ts";

const REDACT_FEATURES = [
    {
        id: "privacy",
        label: "🔒 Privacy",
        description: "Strips emails, names, phones before they hit the model",
    },
    {
        id: "secrets",
        label: "🔑 Secrets",
        description: "Strips API keys & passwords from prompts",
    },
] as const;

const BLOCK_FEATURES = [
    {
        id: "sexual",
        label: "🔞 Sexual",
        description: "Blocks sexual & nude content",
    },
    {
        id: "violence",
        label: "⚔️ Violence",
        description: "Blocks violence, hate speech & insults",
    },
    {
        id: "shield",
        label: "🛡️ Shield",
        description: "Blocks prompt injection & illegal instructions",
    },
] as const;

const ALL_FEATURES = [...REDACT_FEATURES, ...BLOCK_FEATURES];

interface SafetyInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
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
}) => {
    const active = parseFeatures(value);
    const anyActive = active.size > 0;

    function toggle(featureId: string) {
        const next = new Set(active);
        if (next.has(featureId)) {
            next.delete(featureId);
        } else {
            next.add(featureId);
        }
        onChange(serializeFeatures(next));
    }

    function toggleAll() {
        if (anyActive) {
            onChange("");
        } else {
            onChange(ALL_FEATURES.map((f) => f.id).join(","));
        }
    }

    function renderFeature(feature: (typeof ALL_FEATURES)[number]) {
        const isActive = active.has(feature.id);
        return (
            <button
                key={feature.id}
                type="button"
                onClick={() => toggle(feature.id)}
                disabled={disabled}
                className={cn(
                    "text-left px-3 py-2 rounded-lg text-xs transition-all cursor-pointer",
                    isActive
                        ? "bg-green-100 ring-1 ring-green-400 text-green-800"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100",
                )}
            >
                <div className="font-medium">{feature.label}</div>
                <div className="text-[10px] opacity-70">
                    {feature.description}
                </div>
            </button>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Safety</span>
                <button
                    type="button"
                    onClick={toggleAll}
                    disabled={disabled}
                    className={cn(
                        "text-xs px-2 py-0.5 rounded transition-colors cursor-pointer",
                        anyActive
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200",
                    )}
                >
                    {anyActive ? "Clear all" : "Enable all"}
                </button>
            </div>
            <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                    Redact — strips sensitive data from prompts
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {REDACT_FEATURES.map(renderFeature)}
                </div>
            </div>
            <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                    Block — rejects the request entirely
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {BLOCK_FEATURES.map(renderFeature)}
                </div>
            </div>
        </div>
    );
};
