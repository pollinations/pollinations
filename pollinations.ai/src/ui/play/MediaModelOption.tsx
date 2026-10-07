import { WalletKindIcon } from "@pollinations/ui/wallet";

export function MediaModelOption({
    model,
}: {
    model: { title: string; paidOnly: boolean; publisher?: string };
}) {
    return (
        <span className="inline-flex min-w-0 w-full items-center gap-2">
            <span className="truncate">{model.title}</span>
            <span
                role="img"
                aria-label={
                    model.paidOnly
                        ? "Paid Pollen required"
                        : "Works with Paid or Quest Pollen"
                }
                className="inline-flex shrink-0"
            >
                <WalletKindIcon kind={model.paidOnly ? "paid" : "tier"} />
            </span>
            {model.publisher && (
                <span className="ml-auto max-w-[40%] truncate text-xs font-normal text-theme-text-muted">
                    {model.publisher}
                </span>
            )}
        </span>
    );
}
