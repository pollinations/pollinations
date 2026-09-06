import { Section } from "@pollinations/ui";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";
import {
    Await,
    createFileRoute,
    redirect,
    useNavigate,
} from "@tanstack/react-router";
import { apiClient } from "../api.ts";
import { BuyPollenPanel, PollenBalance } from "../components/pollen";
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
    loader: () =>
        apiClient.stripe.billing.$get().then((r) => (r.ok ? r.json() : null)),
    pendingComponent: () => (
        <p role="status" className="text-theme-text-muted">
            Loading billing details…
        </p>
    ),
    component: PollenPage,
});

function PollenPage() {
    const { pack } = Route.useSearch();
    const navigate = useNavigate({ from: "/pollen" });
    const { tierBalance, packBalance, earnings } =
        DashboardRoute.useLoaderData();
    const balances = { tierBalance, packBalance };
    const billingState = Route.useLoaderData();
    const selectedPack = getPollenPackByKey(pack ?? "p5") ?? POLLEN_PACKS[0];

    function selectPack(amount: number): void {
        const selected = getPollenPackByAmount(amount);
        if (selected) void navigate({ search: { pack: selected.packKey } });
    }

    return (
        <div className="flex flex-col gap-6">
            <Section title="Wallet" framed>
                <Await
                    promise={earnings}
                    fallback={<PollenBalance {...balances} />}
                >
                    {(earnings) => (
                        <PollenBalance {...balances} {...earnings} />
                    )}
                </Await>
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
