import { cn, Tooltip } from "@pollinations/ui";
import type { ModelPrice } from "./types.ts";

export function AgentBasePricingLabel({
    model,
    className,
}: {
    model: ModelPrice;
    className?: string;
}) {
    if (!model.agent || !model.baseModel) return null;
    return (
        <div
            className={cn(
                "flex min-w-0 items-center gap-2 text-xs font-medium text-theme-text-muted",
                className,
            )}
        >
            <span className="shrink-0">Base model pricing</span>
            <Tooltip
                content={model.baseModel}
                triggerAs="span"
                className="min-w-0 max-w-48"
            >
                <span className="block max-w-full truncate rounded-md bg-theme-bg-subtle px-2 py-1 font-mono text-[10px] font-medium text-theme-text-muted">
                    {model.baseModel}
                </span>
            </Tooltip>
        </div>
    );
}

export function AgentPricingNote({ model }: { model: ModelPrice }) {
    if (!model.agent || !model.capabilities.includes("pollinations_models")) {
        return null;
    }

    return (
        <p className="mt-2 border-t border-divider pt-2 text-[11px] leading-snug text-theme-text-muted">
            <span className="font-medium text-theme-text-soft">
                Pollinations tools enabled
            </span>{" "}
            · additional model calls use the caller&apos;s access and balance.
        </p>
    );
}
