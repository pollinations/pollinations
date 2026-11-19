import { WalletKindIcon } from "@pollinations/ui/wallet";

export function MediaModelOption({
    model,
    showWalletIcon = true,
    highlights,
}: {
    showWalletIcon?: boolean;
    highlights?: string[];
    model: { title: string; paidOnly: boolean; publisher?: string };
}) {
    // On phones the publisher wraps out of view if it can't fit beside the name.
    return (
        <span className="flex w-full min-w-0 items-center gap-2 max-sm:max-h-[1lh] max-sm:flex-wrap max-sm:content-start max-sm:overflow-hidden">
            <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                <span className="truncate">{model.title}</span>
                {showWalletIcon && (
                    <span
                        role="img"
                        aria-label={
                            model.paidOnly
                                ? "Uses paid balance only"
                                : "Works with any balance"
                        }
                        className="inline-flex shrink-0"
                    >
                        <WalletKindIcon
                            kind={model.paidOnly ? "paid" : "tier"}
                        />
                    </span>
                )}
            </span>
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
            {model.publisher && (
                <span className="ml-auto max-w-[40%] truncate text-xs font-normal text-theme-text-muted max-sm:shrink-0">
                    {model.publisher}
                </span>
            )}
        </span>
    );
}
