import { Chip, Tooltip } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

export const ModelsBadge: FC<{
    permissions: Record<string, string[]> | null;
}> = ({ permissions }) => {
    const models = permissions?.models ?? null;
    const isAllModels = models === null;
    const modelCount = models?.length ?? 0;

    const tooltipContent = (): ReactNode => {
        if (isAllModels) return "✅ Access to all models";
        if (modelCount === 0) return "🚫 No models allowed";
        return (
            <span className="block text-left leading-relaxed">
                <span className="mb-1 block text-theme-text-base">
                    🤖 Allowed models
                </span>
                <span className="block font-mono text-xs whitespace-nowrap">
                    {models?.map((model) => (
                        <span className="block" key={model}>
                            {model}
                        </span>
                    ))}
                </span>
            </span>
        );
    };

    return (
        <Tooltip content={tooltipContent()} ariaLabel="Show allowed models">
            <Chip
                intent={isAllModels ? "success" : undefined}
                size="sm"
                className="cursor-default transition-colors hover:brightness-95"
            >
                {isAllModels ? "All" : modelCount}
            </Chip>
        </Tooltip>
    );
};
