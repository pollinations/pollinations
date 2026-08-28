import { Button, Section, Surface } from "@pollinations/ui";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    BuyPollenPanel,
    GiftPollenPanel,
    PollenBalance,
} from "../components/pollen";
import { AutoTopUpPanel } from "../components/pollen/auto-top-up-panel.tsx";
import { Route as DashboardRoute } from "./_dashboard.tsx";

type PollenSearch = {
    pack?: PollenPackKey;
    mode?: "gift";
    success?: boolean;
    canceled?: boolean;
    session_id?: string;
};

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: (search: Record<string, unknown>): PollenSearch => ({
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : undefined,
        mode: search.mode === "gift" ? "gift" : undefined,
        success:
            search.success === true || search.success === "true"
                ? true
                : undefined,
        canceled:
            search.canceled === true || search.canceled === "true"
                ? true
                : undefined,
        session_id:
            typeof search.session_id === "string"
                ? search.session_id
                : undefined,
    }),
    component: PollenPage,
});

function PollenPage() {
    const { pack, mode, success, canceled, session_id } = Route.useSearch();
    const navigate = useNavigate({ from: "/pollen" });
    const { user, tierBalance, packBalance, paidWeek, tierWeek, billingState } =
        DashboardRoute.useLoaderData();
    const selectedPack = getPollenPackByKey(pack ?? "p5") ?? POLLEN_PACKS[0];
    const isGiftMode = !user || mode === "gift";

    function selectPack(amount: number): void {
        const selected = getPollenPackByAmount(amount);
        if (selected) void navigate({ search: { pack: selected.packKey } });
    }

    function selectMode(nextMode: "self" | "gift"): void {
        void navigate({
            search: {
                pack,
                mode: nextMode === "gift" ? "gift" : undefined,
            },
        });
    }

    return (
        <div className="flex flex-col gap-6">
            {user && (
                <Section title="Wallet" framed>
                    <PollenBalance
                        tierBalance={tierBalance}
                        packBalance={packBalance}
                        paidWeek={paidWeek}
                        tierWeek={tierWeek}
                    />
                </Section>
            )}
            <Section
                title={user ? "Top-up" : "Gift Pollen"}
                intro={
                    user ? undefined : (
                        <span className="flex flex-col gap-1">
                            <span>
                                Buy Pollens for someone else. No account is
                                needed to purchase.
                            </span>
                            <span>
                                Find your redeemable pollen gift code on the
                                invoice emailed after payment.
                            </span>
                        </span>
                    )
                }
                framed
                id="buy-pollen"
            >
                {isGiftMode ? (
                    <GiftPollenPanel
                        success={success}
                        canceled={canceled}
                        sessionId={session_id}
                        onBuyForSelf={
                            user ? () => selectMode("self") : undefined
                        }
                        autoTopUpPanel={
                            user ? (
                                <Surface>
                                    <AutoTopUpPanel
                                        initialBillingState={billingState}
                                    />
                                </Surface>
                            ) : undefined
                        }
                        redeemCard={user ? <RedeemGiftCard /> : undefined}
                    />
                ) : (
                    <BuyPollenPanel
                        initialBillingState={billingState}
                        selectedPackAmount={selectedPack?.amountUsd ?? 5}
                        onSelectedPackAmountChange={selectPack}
                        onBuyAsGift={() => selectMode("gift")}
                        redeemCard={<RedeemGiftCard />}
                    />
                )}
            </Section>
        </div>
    );
}

function RedeemGiftCard() {
    return (
        <Surface className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="font-semibold text-theme-text-strong">
                    Have a gift code?
                </p>
                <p className="mt-1 text-sm text-theme-text-muted">
                    Redeem it into your Paid Pollen balance.
                </p>
            </div>
            <div data-theme="accent" className="shrink-0">
                <Button as="a" href="/redeem" className="w-full sm:w-auto">
                    Redeem gift code
                </Button>
            </div>
        </Surface>
    );
}
