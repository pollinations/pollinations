import { Button, CopyButton, InlineLink, Section } from "@pollinations/ui";
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
import { apiClient } from "../api.ts";
import { BuyPollenPanel, PollenBalance } from "../components/pollen";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/pollen")({
    validateSearch: (
        search: Record<string, unknown>,
    ): { pack?: PollenPackKey; gift_session?: string } => ({
        gift_session:
            typeof search.gift_session === "string"
                ? search.gift_session
                : undefined,
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
    loaderDeps: ({ search }) => ({ giftSession: search.gift_session }),
    loader: async ({ deps }) => {
        const [billing, gift] = await Promise.all([
            apiClient.stripe.billing
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            deps.giftSession
                ? apiClient.stripe.gifts[":sessionId"]
                      .$get({ param: { sessionId: deps.giftSession } })
                      .then((r) => (r.ok ? r.json() : null))
                : null,
        ]);
        return { billing, gift };
    },
    pendingComponent: () => (
        <output className="text-theme-text-muted">
            Loading billing details…
        </output>
    ),
    component: PollenPage,
});

function PollenPage() {
    const { pack, gift_session } = Route.useSearch();
    const router = useRouter();
    const navigate = useNavigate({ from: "/pollen" });
    const { tierBalance, packBalance, earnings } =
        DashboardRoute.useLoaderData();
    const balances = { tierBalance, packBalance };
    const { billing: billingState, gift } = Route.useLoaderData();
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
            <Section title="Give Pollen" framed>
                <div className="flex flex-col gap-3">
                    <p>
                        Buy a code to share with someone. They sign in and claim
                        it as a private Bonus reward.
                    </p>
                    <Button
                        as="a"
                        href={`/api/stripe/checkout/${selectedPack.packKey}?gift=true`}
                    >
                        Give {selectedPack.amountUsd} Pollen
                    </Button>
                    <p className="text-sm text-theme-text-muted">
                        Uses the amount selected above. Fees and tax are shown
                        at checkout.
                    </p>
                    {gift_session &&
                        (gift ? (
                            <div className="flex flex-col gap-2">
                                <p>
                                    Your gift code (also on your Stripe
                                    invoice):
                                </p>
                                <code className="break-all">{gift.code}</code>
                                <CopyButton
                                    value={`${window.location.origin}/redeem#${gift.code}`}
                                >
                                    {(copied) =>
                                        copied ? "Copied!" : "Copy gift link"
                                    }
                                </CopyButton>
                                <p className="text-sm text-theme-text-muted">
                                    Keep it private. Anyone with this code can
                                    claim it once.
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p>
                                    Your gift is not available yet. If payment
                                    is still processing, check again shortly.
                                </p>
                                <Button
                                    onClick={() => void router.invalidate()}
                                >
                                    Check again
                                </Button>
                            </div>
                        ))}
                    <InlineLink href="/redeem">Have a gift code?</InlineLink>
                </div>
            </Section>
        </div>
    );
}
