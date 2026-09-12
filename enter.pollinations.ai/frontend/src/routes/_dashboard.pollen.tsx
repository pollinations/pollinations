import { Button, Section } from "@pollinations/ui";
import { ErrorBanner } from "@pollinations/ui/auth";
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
    useRouter,
} from "@tanstack/react-router";
import { BuyPollenPanel, PollenBalance } from "../components/pollen";
import { WalletPaymentStatus } from "../components/pollen/wallet-payment-status.tsx";
import { loadWallet } from "../lib/load-wallet.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: (
        search: Record<string, unknown>,
    ): {
        pack?: PollenPackKey;
        session_id?: string;
        stripe_canceled?: boolean;
    } => ({
        session_id:
            typeof search.session_id === "string"
                ? search.session_id
                : undefined,
        stripe_canceled:
            search.stripe_canceled === true ||
            search.stripe_canceled === "true" ||
            undefined,
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
    loaderDeps: ({ search }) => ({ sessionId: search.session_id }),
    loader: ({ deps }) => loadWallet(deps.sessionId),
    pendingComponent: () => <output>Loading wallet…</output>,
    errorComponent: ({ error }) => {
        const router = useRouter();
        return (
            <div className="space-y-3">
                <ErrorBanner>{error.message}</ErrorBanner>
                <Button onClick={() => void router.invalidate()}>
                    Try again
                </Button>
            </div>
        );
    },
    component: PollenPage,
});

function PollenPage() {
    const { pack, stripe_canceled } = Route.useSearch();
    const router = useRouter();
    const navigate = useNavigate({ from: "/pollen" });
    const { earnings } = DashboardRoute.useLoaderData();
    const wallet = Route.useLoaderData();
    const balances = {
        tierBalance: wallet.tierBalance,
        packBalance: wallet.packBalance,
    };
    const selectedPack = getPollenPackByKey(pack ?? "p5") ?? POLLEN_PACKS[0];

    function selectPack(amount: number): void {
        const selected = getPollenPackByAmount(amount);
        if (selected)
            void navigate({
                search: (old) => ({ ...old, pack: selected.packKey }),
            });
    }

    return (
        <div className="flex flex-col gap-6">
            <WalletPaymentStatus
                payment={wallet.payment}
                canceled={stripe_canceled}
            />
            {wallet.payment === "pending" && (
                <Button onClick={() => void router.invalidate()}>
                    Check payment
                </Button>
            )}
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
            {wallet.payment !== "pending" && (
                <Section title="Top-up" framed id="buy-pollen">
                    <BuyPollenPanel
                        initialBillingState={wallet.billing}
                        selectedPackAmount={selectedPack?.amountUsd ?? 5}
                        onSelectedPackAmountChange={selectPack}
                    />
                </Section>
            )}
        </div>
    );
}
