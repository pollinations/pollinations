import { Section } from "@pollinations/ui";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BuyPollenPanel, PollenBalance } from "../components/pollen";
import { useActiveOrganizationId } from "../lib/active-organization.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: (
        search: Record<string, unknown>,
    ): { pack?: PollenPackKey } => ({
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
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
    const { pack } = Route.useSearch();
    const navigate = useNavigate({ from: "/pollen" });
    const {
        tierBalance,
        packBalance,
        paidWeek,
        tierWeek,
        billingState,
        organizations,
    } = DashboardRoute.useLoaderData();
    const activeOrganizationId = useActiveOrganizationId();
    const activeOrganization = organizations.find(
        (org) => org.id === activeOrganizationId,
    );
    const selectedPack = getPollenPackByKey(pack ?? "p5") ?? POLLEN_PACKS[0];

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
                    // Weekly-earnings figures are personal-only (Tinybird
                    // isn't org-tagged yet — see AGENTS.md deferred scope);
                    // don't show the signed-in member's own 7d earnings next
                    // to the organization's balance.
                    paidWeek={activeOrganizationId ? 0 : paidWeek}
                    tierWeek={activeOrganizationId ? 0 : tierWeek}
                />
            </Section>
            <Section title="Top-up" framed id="buy-pollen">
                <BuyPollenPanel
                    initialBillingState={billingState}
                    selectedPackAmount={selectedPack?.amountUsd ?? 5}
                    onSelectedPackAmountChange={selectPack}
                    organizationId={activeOrganizationId ?? undefined}
                    canFund={
                        !activeOrganizationId ||
                        !!activeOrganization?.canFundOrganization
                    }
                />
            </Section>
        </div>
    );
}
