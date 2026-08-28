import { Chip, Tooltip } from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import type { ModelPermissionEntry } from "./types.ts";

export const ModelsBadge: FC<{
    permissions: Record<string, string[] | ModelPermissionEntry[]> | null;
}> = ({ permissions }) => {
    const models = permissions?.models ?? null;
    const isAllModels = models === null;
    const modelCount = models?.length ?? 0;

    const tooltipContent = (): ReactNode => {
        if (isAllModels) return "Access to all models";
        if (modelCount === 0) return "No models allowed";
        return (
            <span className="block text-left leading-relaxed">
                <span className="mb-1 block text-theme-text-base">
                    Allowed models
                </span>
                <span className="block font-mono text-xs whitespace-nowrap">
                    {models?.map((model) => {
                        const modelId =
                            typeof model === "string" ? model : model.id;
                        return (
                            <span className="block" key={modelId}>
                                {modelId}
                            </span>
                        );
                    })}
                </span>
            </span>
        );
    };

    return (
        <Tooltip content={tooltipContent()} ariaLabel="Show allowed models">
            <Chip
                intent="neutral"
                size="sm"
                className={`cursor-default transition-colors hover:brightness-95 ${
                    isAllModels ? "text-intent-success-text" : ""
                }`}
            >
                {isAllModels ? "All" : modelCount}
            </Chip>
        </Tooltip>
    );
};
