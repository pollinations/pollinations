import type { FC } from "react";
import { cn } from "@/util.ts";

const SAFETY_FEATURES = [
    {
        id: "privacy",
        label: "Privacy",
        description: "Redact emails, phones, names, addresses",
    },
    {
        id: "secrets",
        label: "Secrets",
        description: "Redact API keys, passwords, tokens",
    },
    {
        id: "nsfw",
        label: "NSFW",
        description: "Block sexual/violent content",
    },
    {
        id: "shield",
        label: "Shield",
        description: "Block prompt injection",
    },
] as const;

interface SafetyInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

function parseFeatures(value: string): Set<string> {
    if (!value) return new Set();
    return new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
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
            onChange(SAFETY_FEATURES.map((f) => f.id).join(","));
        }
    }

    return (
        <div className="space-y-2">
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
            <div className="grid grid-cols-2 gap-2">
                {SAFETY_FEATURES.map((feature) => {
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
                })}
            </div>
        </div>
    );
};
