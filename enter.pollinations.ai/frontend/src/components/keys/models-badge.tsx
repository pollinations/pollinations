import { Chip, Tooltip } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

export const ModelsBadge: FC<{
    permissions: Record<string, string[]> | null;
}> = ({ permissions }) => {
    const models = permissions?.models ?? null;
    const isAllModels = models === null;
    const modelCount = models?.length ?? 0;

    const tooltipContent = (): ReactNode => {
        if (isAllModels) return "Access to all models";
        if (modelCount === 0) return "No models allowed";
        return (
            <span className="block font-mono text-xs leading-relaxed text-left whitespace-nowrap">
                {models?.map((model) => (
                    <span className="block" key={model}>
                        {model}
                    </span>
                ))}
            </span>
        );
    };

    return (
        <Tooltip content={tooltipContent()} ariaLabel="Show allowed models">
            <Chip
                theme={isAllModels ? "green" : "amber"}
                size="sm"
                className="cursor-default transition-colors hover:brightness-95"
            >
                {isAllModels ? "All" : modelCount}
            </Chip>
        </Tooltip>
    );
};
