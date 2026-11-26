import { Chip, ShieldCheckIcon } from "@pollinations/ui";
import { ModelBrandIcon } from "@pollinations/ui/gen";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import { isNewModel } from "../../../../shared/model-recency";

export function MediaModelOption({
    model,
    showIcon = true,
    showPricing = true,
    perDollar,
}: {
    showIcon?: boolean;
    showPricing?: boolean;
    perDollar?: string;
    model: {
        title: string;
        paidOnly: boolean;
        publisher?: string;
        addedDate?: number;
        category?: string;
        community?: boolean;
        agent?: boolean;
        verified?: boolean;
        brandIconUrl?: string;
    };
}) {
    return (
        <span className="flex w-full min-w-0 items-center gap-2">
            {showIcon && (
                <ModelBrandIcon
                    model={model}
                    className="size-4 shrink-0 text-theme-text-muted"
                />
            )}
            <span className="flex min-w-0 flex-1 items-baseline gap-[0.6em]">
                <span className="truncate">{model.title}</span>
                {model.verified && (
                    <span
                        className="inline-flex items-baseline gap-1 text-xs text-theme-text-muted"
                        title="Published and run by Pollinations"
                    >
                        <ShieldCheckIcon
                            aria-hidden="true"
                            className="size-3 self-center"
                        />
                        Official
                    </span>
                )}
                {isNewModel(model.addedDate) && (
                    <Chip intent="info" size="sm" className="play-model-chip">
                        New
                    </Chip>
                )}
            </span>
            {showPricing && (
                <span className="inline-flex shrink-0 items-center text-xs font-normal tabular-nums text-theme-text-muted">
                    <span
                        title={
                            perDollar && perDollar !== "Free"
                                ? "Estimated requests per $1, based on the median cost of successful paid requests over the last 7 days."
                                : undefined
                        }
                    >
                        {perDollar ?? (
                            <>
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">
                                    Estimate unavailable
                                </span>
                            </>
                        )}
                    </span>
                    <span
                        role="img"
                        aria-label={
                            model.paidOnly
                                ? "Uses paid balance only"
                                : "Works with any balance"
                        }
                        className="inline-flex w-9 justify-center"
                    >
                        <WalletKindIcon
                            kind={model.paidOnly ? "paid" : "tier"}
                        />
                    </span>
                </span>
            )}
        </span>
    );
}
