import type { FC } from "react";
import { cn } from "@/util.ts";

const SAFETY_FEATURES = [
    {
        id: "privacy",
        label: "🔒 Privacy",
        description: "redacts emails, names, phones, IPs",
    },
    {
        id: "secrets",
        label: "🔑 Secrets",
        description: "redacts api keys, passwords, tokens",
    },
    {
        id: "sexual",
        label: "🔞 Sexual",
        description: "blocks nudity and sexual content",
    },
    {
        id: "violence",
        label: "⚔️ Violence",
        description: "blocks gore, hate, insults",
    },
    // {
    //     id: "shield",
    //     label: "🛡️ Shield",
    //     description: "blocks prompt injection, illegal instructions",
    // },
] as const;

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
            onChange(SAFETY_FEATURES.map((f) => f.id).join(","));
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold">Safety</span>
                <button
                    type="button"
                    onClick={toggleAll}
                    disabled={disabled}
                    className={cn(
                        "text-xs px-2 py-1 rounded-md transition-colors cursor-pointer",
                        anyActive
                            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                            : "bg-green-100 text-green-700 hover:bg-green-200",
                    )}
                >
                    {anyActive ? "Clear all" : "Enable all"}
                </button>
            </div>
            <div className="space-y-2">
                {SAFETY_FEATURES.map((feature) => {
                    const isActive = active.has(feature.id);
                    return (
                        <button
                            key={feature.id}
                            type="button"
                            onClick={() => toggle(feature.id)}
                            disabled={disabled}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
                                isActive
                                    ? "border-green-400 bg-green-50"
                                    : "border-gray-200 hover:border-gray-300",
                                !disabled && "cursor-pointer",
                                disabled && "opacity-50 cursor-not-allowed",
                            )}
                        >
                            <div className="flex-1">
                                <span className="text-sm font-medium">
                                    {feature.label}
                                </span>
                                <span className="text-sm text-gray-500">
                                    {" "}
                                    {feature.description}
                                </span>
                            </div>
                            <span className="text-gray-400 text-lg leading-none">
                                {isActive ? "✕" : "+"}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
