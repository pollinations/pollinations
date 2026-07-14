import { Section } from "@pollinations/ui";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BuyPollenPanel, PollenBalance } from "../components/pollen";
import {
    DEFAULT_POLLEN_PACK_KEY,
    validatePollenSearch,
} from "../components/pollen/pollen-search.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: validatePollenSearch,
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
    const search = Route.useSearch();
    const navigate = useNavigate({ from: "/pollen" });
    const { tierBalance, packBalance, paidWeek, tierWeek, billingState } =
        DashboardRoute.useLoaderData();
    const selectedPack =
        getPollenPackByKey(search.pack ?? DEFAULT_POLLEN_PACK_KEY) ??
        POLLEN_PACKS[0];

    function selectPack(amount: number): void {
        const pack = getPollenPackByAmount(amount);
        if (!pack) return;
        void navigate({
            search: (previous) => ({
                ...previous,
                pack:
                    pack.packKey === DEFAULT_POLLEN_PACK_KEY
                        ? undefined
                        : pack.packKey,
            }),
        });
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
            <Section title="Top-up" framed id="buy-pollen">
                <BuyPollenPanel
                    initialBillingState={billingState}
                    selectedPackAmount={selectedPack?.amountUsd ?? 5}
                    onSelectedPackAmountChange={selectPack}
                />
            </Section>
        </div>
    );
}
