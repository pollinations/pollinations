import { Chip } from "@pollinations/ui";
import { ModelBrandIcon } from "@pollinations/ui/gen";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import { isNewModel } from "../../../../shared/model-recency";

export function MediaModelOption({
    model,
    showPricing = true,
    perDollar,
}: {
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
        brandIconUrl?: string;
    };
}) {
    return (
        <span className="flex w-full min-w-0 items-center gap-2">
            <ModelBrandIcon
                model={model}
                className="size-4 shrink-0 text-theme-text-muted"
            />
            <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{model.title}</span>
                {isNewModel(model.addedDate) && (
                    <Chip intent="success" size="sm" className="play-model-new">
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
