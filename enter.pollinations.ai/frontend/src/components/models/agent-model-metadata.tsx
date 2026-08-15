import { cn } from "@pollinations/ui";
import type { ModelPrice } from "./types.ts";

export function AgentModelMetadata({ model }: { model: ModelPrice }) {
    const hasPollinationsModelAccess = model.capabilities.includes(
        "pollinations_models",
    );
    if (!model.agent || (!model.baseModel && !hasPollinationsModelAccess)) {
        return null;
    }

    return (
        <div className="flex flex-col gap-1 text-xs text-theme-text-muted">
            {model.baseModel && (
                <>
                    <span>
                        Base model:{" "}
                        <span className="font-mono">{model.baseModel}</span>
                    </span>
                    <span>
                        Rates are per base-model call; total usage depends on
                        the agent&apos;s steps and tools.
                    </span>
                </>
            )}
            {hasPollinationsModelAccess && (
                <span>
                    Can call other Pollinations models on the caller&apos;s
                    behalf using their API access and balance.
                </span>
            )}
        </div>
    );
}

export function AgentBasePricingLabel({
    model,
    className,
}: {
    model: ModelPrice;
    className?: string;
}) {
    if (!model.agent || !model.baseModel) return null;
    return (
        <p
            className={cn(
                "text-xs font-medium text-theme-text-muted",
                className,
            )}
        >
            Base model pricing
        </p>
    );
}
