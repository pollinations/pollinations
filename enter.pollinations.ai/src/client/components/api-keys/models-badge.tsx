import type { FC } from "react";
import { useState } from "react";
import { Badge } from "../ui/badge.tsx";

export const ModelsBadge: FC<{
    permissions: Record<string, string[]> | null;
}> = ({ permissions }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const models = permissions?.models ?? null;
    const isAllModels = models === null;
    const modelCount = models?.length ?? 0;

    const handleInteraction = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if ("key" in e && e.key !== "Enter" && e.key !== " ") return;
        if ("key" in e) e.preventDefault();
        setShowTooltip((prev) => !prev);
    };

    const tooltipContent = () => {
        if (isAllModels) return "Access to all models";
        if (modelCount === 0) return "No models allowed";
        return (
            <div className="font-mono text-[11px] leading-relaxed text-left whitespace-nowrap">
                {models?.map((model) => (
                    <div key={model}>{model}</div>
                ))}
            </div>
        );
    };

    return (
        <button
            type="button"
            className="relative inline-flex items-center"
            onClick={handleInteraction}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onKeyDown={handleInteraction}
            aria-label="Show allowed models"
        >
            <Badge
                color={isAllModels ? "green" : "amber"}
                size="sm"
                className="cursor-pointer transition-colors hover:brightness-95"
            >
                {isAllModels ? "All" : modelCount}
            </Badge>
            {showTooltip && (
                <div
                    className="fixed z-[9999] px-2 py-1.5 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 pointer-events-none"
                    style={{
                        top: "var(--tooltip-top)",
                        left: "var(--tooltip-left)",
                    }}
                    ref={(el) => {
                        if (!el) return;
                        const btn = el.parentElement;
                        if (!btn) return;
                        const rect = btn.getBoundingClientRect();
                        el.style.setProperty(
                            "--tooltip-top",
                            `${rect.bottom + 4}px`,
                        );
                        el.style.setProperty(
                            "--tooltip-left",
                            `${rect.left}px`,
                        );
                    }}
                >
                    {tooltipContent()}
                </div>
            )}
        </button>
    );
};
