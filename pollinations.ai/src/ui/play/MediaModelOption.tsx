import { WalletKindIcon } from "@pollinations/ui/wallet";

export function MediaModelOption({
    model,
    showPricing = true,
    cost,
    highlights,
}: {
    showPricing?: boolean;
    cost?: string;
    highlights?: string[];
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
                {highlights && highlights.length > 0 && (
                    <span className="hidden flex-wrap gap-1 sm:inline-flex">
                        {highlights.map((highlight) => (
                            <span
                                key={highlight}
                                className="rounded border border-current/20 px-1 text-[0.625rem] leading-4 font-medium tracking-wide text-theme-text-muted"
                            >
                                {highlight}
                            </span>
                        ))}
                    </span>
                )}
            </span>
            {showPricing && (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal tabular-nums text-theme-text-muted">
                    <span title="7-day median cost per successful paid request">
                        <span className="sr-only">
                            7-day median cost per paid request{" "}
                        </span>
                        {cost ?? (
                            <>
                                <span aria-hidden="true">—</span>
                                <span className="sr-only">unavailable</span>
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
                        className="inline-flex"
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
