import type { FC, ReactNode } from "react";
import { Badge } from "../ui/badge.tsx";
import { Tooltip } from "../ui/tooltip.tsx";

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
            <span className="block font-mono text-[11px] leading-relaxed text-left whitespace-nowrap">
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
            <Badge
                color={isAllModels ? "green" : "amber"}
                size="sm"
                className="cursor-default transition-colors hover:brightness-95"
            >
                {isAllModels ? "All" : modelCount}
            </Badge>
        </Tooltip>
    );
};
