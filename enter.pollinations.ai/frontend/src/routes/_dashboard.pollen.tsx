import { Section, Surface } from "@pollinations/ui";
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
import {
    BillingPreviewSwitch,
    billingPreviewSearch,
    previewBilling,
} from "../components/pollen/billing-preview.tsx";
import { CheckoutConfirmation } from "../components/pollen/checkout-confirmation.tsx";
import {
    autoTopUpSetupSearch,
    checkoutReturnSearch,
} from "../lib/top-up-search.ts";
import { Route as DashboardRoute, useDashboardRetry } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: (
        search: Record<string, unknown>,
    ): {
        pack?: PollenPackKey;
        session_id?: string;
        auto_top_up_setup?: true;
        preview?: string;
    } => ({
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : undefined,
        ...checkoutReturnSearch(search),
        ...autoTopUpSetupSearch(search),
        ...(import.meta.env.DEV ? billingPreviewSearch(search) : {}),
    }),
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    loaderDeps: ({ search }) => ({ preview: search.preview }),
    loader: ({ deps: { preview } }) => {
        const billing = apiClient.stripe.billing
            .$get()
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
        return {
            billing: preview
                ? billing.then((real) => previewBilling(preview, real))
                : billing,
        };
    },
    component: PollenPage,
});

function PollenPage() {
    const retry = useDashboardRetry("balance");
    const {
        pack,
        session_id: checkoutSessionId,
        auto_top_up_setup: setupReturn,
        preview,
    } = Route.useSearch();
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
            <Section title="Pollen">
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
                            <LoadError onRetry={retry}>
                                Couldn’t load your balance.
                            </LoadError>
                        )
                    }
                </Await>
            </Section>
            <Section title="Top-up" id="buy-pollen">
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
                                setupReturn={setupReturn}
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
                                <LoadError onRetry={reloadWallet}>
                                    Couldn’t load your billing details.
                                </LoadError>
                            )
                        }
                    </Await>
                </Suspense>
            </Section>
            {import.meta.env.DEV && (
                <BillingPreviewSwitch
                    value={preview}
                    onChange={(id) =>
                        void navigate({
                            search: (prev) => ({ ...prev, preview: id }),
                        })
                    }
                />
            )}
        </>
    );
}
