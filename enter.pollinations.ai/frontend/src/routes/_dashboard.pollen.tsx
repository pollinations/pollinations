import { Alert, Section, TabButton } from "@pollinations/ui";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BuyPollenPanel, GiftPanel, PollenBalance } from "../components/pollen";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: (
        search: Record<string, unknown>,
    ): {
        pack?: PollenPackKey;
        gift?: string;
        recipient?: string;
        stripe_success?: string;
    } => ({
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : undefined,
        gift: typeof search.gift === "string" ? search.gift : undefined,
        recipient:
            typeof search.recipient === "string" ? search.recipient : undefined,
        stripe_success:
            typeof search.stripe_success === "string"
                ? search.stripe_success
                : undefined,
    }),
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: PollenPage,
});

function PollenPage() {
    const { pack, gift, recipient, stripe_success } = Route.useSearch();
    const navigate = useNavigate({ from: "/pollen" });
    const { tierBalance, packBalance, paidWeek, tierWeek, billingState } =
        DashboardRoute.useLoaderData();
    const selectedPack = getPollenPackByKey(pack ?? "p5") ?? POLLEN_PACKS[0];
    const [tab, setTab] = useState<"buy" | "gift">(
        gift === "1" ? "gift" : "buy",
    );
    const giftConfirmed = gift === "1" && stripe_success === "true";

    function selectPack(amount: number): void {
        const selected = getPollenPackByAmount(amount);
        if (selected) void navigate({ search: { pack: selected.packKey } });
    }

    return (
        <div className="flex flex-col gap-6">
            <Section title="Wallet" framed>
                <PollenBalance
                    tierBalance={tierBalance}
                    packBalance={packBalance}
                    paidWeek={paidWeek}
                    tierWeek={tierWeek}
                />
            </Section>
            {giftConfirmed && recipient && (
                <Alert intent="info" title="Gift sent">
                    You gifted Pollen to @{recipient}. 🎁
                </Alert>
            )}
            <Section title="Top-up" framed id="buy-pollen">
                <div className="mb-4 flex gap-2">
                    <TabButton
                        active={tab === "buy"}
                        onClick={() => setTab("buy")}
                    >
                        Buy for me
                    </TabButton>
                    <TabButton
                        active={tab === "gift"}
                        onClick={() => setTab("gift")}
                    >
                        Gift to someone
                    </TabButton>
                </div>
                {tab === "buy" ? (
                    <BuyPollenPanel
                        initialBillingState={billingState}
                        selectedPackAmount={selectedPack?.amountUsd ?? 5}
                        onSelectedPackAmountChange={selectPack}
                    />
                ) : (
                    <GiftPanel />
                )}
            </Section>
        </div>
    );
}
