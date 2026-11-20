import { WalletKindIcon } from "@pollinations/ui/wallet";

export function MediaModelOption({
    model,
    showPricing = true,
    perDollar,
}: {
    showPricing?: boolean;
    perDollar?: string;
    model: { title: string; paidOnly: boolean; publisher?: string };
}) {
    return (
        <span className="flex w-full min-w-0 items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-2 max-sm:max-h-[1lh] max-sm:flex-wrap max-sm:content-start max-sm:overflow-hidden">
                <span className="truncate">{model.title}</span>
                {model.publisher && (
                    <span className="max-w-[40%] truncate text-xs font-normal text-theme-text-muted max-sm:shrink-0">
                        {model.publisher}
                    </span>
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
