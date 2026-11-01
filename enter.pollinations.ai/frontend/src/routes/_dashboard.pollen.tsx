import { Alert, Section, Surface } from "@pollinations/ui";
import { isPollenPackKey, type PollenPackKey } from "@shared/pollen-packs.ts";
import {
    Await,
    createFileRoute,
    redirect,
    useNavigate,
    useRouter,
} from "@tanstack/react-router";
import { Suspense, useDeferredValue } from "react";
import { apiClient } from "../api.ts";
import {
    LoadError,
    PageStatus,
} from "../components/layout/dashboard-loading.tsx";
import {
    BillingPanel,
    BuyPollenPanel,
    EditOnStripeLink,
    PollenBalance,
} from "../components/pollen";
import { CheckoutConfirmation } from "../components/pollen/checkout-confirmation.tsx";
import { BALANCE_PATH } from "../hooks/use-account-balance.ts";
import { checkoutNotice, checkoutReturnSearch } from "../lib/top-up-search.ts";
import { Route as DashboardRoute, useDashboardRetry } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: (
        search: Record<string, unknown>,
    ): ReturnType<typeof checkoutReturnSearch> & {
        pack?: PollenPackKey;
    } => ({
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : undefined,
        ...checkoutReturnSearch(search),
    }),
    beforeLoad: ({ context, location }) => {
        if (!context.user && !context.sessionUnavailable) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    loader: () => ({
        billing: apiClient.stripe.billing
            .$get()
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
    }),
    component: PollenPage,
});

function PollenPage() {
    const retry = useDashboardRetry("balance");
    const search = Route.useSearch();
    const { pack, session_id: checkoutSessionId } = search;
    // Back from Stripe's page without paying, or it never opened.
    const notice = checkoutNotice(search);
    const navigate = useNavigate({ from: "/pollen" });
    const router = useRouter();
    // Balance and billing both come from loaders; rerun them once credited.
    const reloadWallet = () => void router.invalidate();
    const { balance, earnings } = useDeferredValue(
        DashboardRoute.useLoaderData(),
    );
    const { billing } = useDeferredValue(Route.useLoaderData());

    return (
        <>
            <Section title="pollen">
                <Await promise={balance} fallback={<PageStatus />}>
                    {(balances) =>
                        balances ? (
                            <Await
                                promise={earnings}
                                fallback={
                                    <>
                                        <PollenBalance {...balances} />
                                        <PageStatus />
                                    </>
                                }
                            >
                                {(earnings) => (
                                    <PollenBalance
                                        {...balances}
                                        {...earnings}
                                    />
                                )}
                            </Await>
                        ) : (
                            <LoadError onRetry={retry} paths={[BALANCE_PATH]}>
                                Couldn’t load your balance.
                            </LoadError>
                        )
                    }
                </Await>
            </Section>
            <Section title="Top-up" id="buy-pollen">
                {notice && (
                    <Alert intent={search.checkout_error ? "danger" : "info"}>
                        {notice}
                    </Alert>
                )}
                {checkoutSessionId && (
                    <Surface>
                        <CheckoutConfirmation
                            sessionId={checkoutSessionId}
                            onCredited={reloadWallet}
                            onRetry={() => void navigate({ search: { pack } })}
                        />
                    </Surface>
                )}
                <Suspense fallback={<PageStatus />}>
                    <Await promise={billing}>
                        {(billingState) => (
                            <BuyPollenPanel
                                initialBilling={billingState}
                                onWalletChange={reloadWallet}
                                initialPack={pack}
                            />
                        )}
                    </Await>
                </Suspense>
            </Section>
            {/* The Top-up section above shows the page's one loading status. */}
            <Section title="Billing" id="billing" action={<EditOnStripeLink />}>
                <Suspense fallback={null}>
                    <Await promise={billing}>
                        {(billingState) =>
                            billingState ? (
                                <BillingPanel billing={billingState} />
                            ) : (
                                // Not "none saved": it may well be there.
                                <LoadError
                                    onRetry={reloadWallet}
                                    paths={["/api/stripe/billing"]}
                                >
                                    Couldn’t load your billing details.
                                </LoadError>
                            )
                        }
                    </Await>
                </Suspense>
            </Section>
        </>
    );
}
