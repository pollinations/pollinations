import { WalletKindIcon } from "@pollinations/ui/wallet";

export function MediaModelOption({
    model,
}: {
    model: { title: string; paidOnly?: boolean };
}) {
    return (
        <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <span className="truncate">{model.title}</span>
            {model.paidOnly !== undefined && (
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
            )}
        </span>
    );
}
