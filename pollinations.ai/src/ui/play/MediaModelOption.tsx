import { WalletKindIcon } from "@pollinations/ui/wallet";

export function MediaModelOption({
    model,
}: {
    model: { title: string; paidOnly: boolean; publisher?: string };
}) {
    return (
        <span className="flex w-full min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                <span className="truncate">{model.title}</span>
                <span
                    role="img"
                    aria-label={
                        model.paidOnly
                            ? "Uses paid balance only"
                            : "Works with any balance"
                    }
                    className="inline-flex shrink-0"
                >
                    <WalletKindIcon kind={model.paidOnly ? "paid" : "tier"} />
                </span>
            </span>
            {model.publisher && (
                <span className="max-w-full truncate text-xs font-normal text-theme-text-muted sm:ml-auto sm:max-w-[40%]">
                    {model.publisher}
                </span>
            )}
        </span>
    );
}
