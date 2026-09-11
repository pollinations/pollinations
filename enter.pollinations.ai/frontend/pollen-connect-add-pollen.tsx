import {
    type AppAccountState,
    AppUserMenuView,
    Button,
    PollinationsConnectionPanel,
    Surface,
} from "@pollinations/ui";
import { ErrorBanner, PollinationsSignInButton } from "@pollinations/ui/auth";
import { AddPollenDialog } from "@pollinations/ui/wallet";
import { useRef, useState } from "react";
import {
    calculateServiceFeeCents,
    formatUsdCentsCompact,
    POLLEN_PACKS,
} from "../../shared/pollen-packs";
import {
    addPollenAmounts,
    addPollenPlan,
    defaultAddPollenAmount,
} from "./pollen-connect-add-pollen-data";
import { ProviderScreen } from "./pollen-connect-provider";

export type AddPollenStage =
    | "play"
    | "connect"
    | "amount"
    | "checkout"
    | "pending";

// User-facing behavior verified against feat/website-v2 at c7a5f1234.
// This adapter only supplies sample data; shared UI never initiates purchases.
export function AddPollenPreview({
    initialStage,
    scenario,
}: {
    initialStage: AddPollenStage;
    scenario: string | null;
}) {
    const params = new URLSearchParams(location.search);
    const dashboardParams = new URLSearchParams(params);
    dashboardParams.set("screen", "enter-connected");
    const accountPurchase =
        params.get("purchase") === "account" ||
        params.get("screen") === "account-checkout";
    const simulation = params.get("journey") === "1";
    const simBalance =
        Number(params.get("sim_paid")) + Number(params.get("sim_quest"));
    const simBudget = Number(params.get("sim_budget"));
    const simCompleted =
        simulation && params.get("sim_payment") === "completed";
    const paidExample = scenario === "after-payment";
    const coveredExample = scenario === "after-budget";
    const [stage, setStage] = useState(initialStage);
    const [amount, setAmount] = useState<number>(
        simulation
            ? Number(params.get("sim_amount") ?? defaultAddPollenAmount)
            : defaultAddPollenAmount,
    );
    const [balance, setBalance] = useState(
        simulation
            ? simBalance
            : paidExample
              ? 30
              : scenario === "covered" || coveredExample
                ? 40
                : 10,
    );
    const [budget, setBudget] = useState(
        simulation
            ? simBudget
            : paidExample || coveredExample
              ? 25
              : scenario === "limit-reached"
                ? 0
                : 5,
    );
    const [error, setError] = useState<string | null>(
        scenario === "start-error"
            ? "Could not start top-up."
            : scenario === "confirm-error"
              ? "Could not complete top-up."
              : scenario === "status-error"
                ? "Could not check the top-up."
                : scenario === "checkout-error"
                  ? "Payment failed. Try again."
                  : null,
    );
    const completed = useRef(simCompleted || paidExample || coveredExample);
    const [selectedPack, setSelectedPack] = useState(
        Number(params.get("sim_pack")) || undefined,
    );
    const plan = addPollenPlan(balance, budget, amount, selectedPack);
    const purchasePack =
        POLLEN_PACKS.find((pack) => pack.amountUsd === selectedPack) ??
        plan.pack ??
        POLLEN_PACKS.find((pack) => pack.amountUsd === 5);
    const finish = (payment: boolean) => {
        if (!purchasePack || (payment && completed.current)) return;
        completed.current = true;
        const updatedBalance = balance + (payment ? purchasePack.amountUsd : 0);
        setBalance(updatedBalance);
        if (!payment) setBudget(plan.resultingBudget);
        setStage(payment ? "amount" : "play");
    };
    const startAdding = () => {
        completed.current = false;
        setError(null);
        setAmount(defaultAddPollenAmount);
        setSelectedPack(undefined);
        setStage("amount");
    };
    const confirmationError = {
        expired: "Top-up request expired. Return to the app and try again.",
        "invalid-link": "Invalid top-up link.",
        reconnect: "Reconnect this app before topping up.",
        "account-error": "Could not check your account.",
        "sign-in-error": "Sign-in did not complete.",
    }[scenario ?? ""];
    const returnToAccount = (purchased = 0) => {
        const url = new URL(location.href);
        url.searchParams.set("screen", "enter-connected");
        url.searchParams.set(
            "sim_paid",
            `${Number(params.get("sim_paid") ?? 10) + purchased}`,
        );
        url.searchParams.set("sim_quest", params.get("sim_quest") ?? "5");
        location.href = url.toString();
    };
    const allowanceDialog = (
        <AddPollenDialog
            open={stage === "amount" || stage === "pending"}
            amount={amount}
            shortfall={plan.shortfall}
            amounts={addPollenAmounts}
            appName="App example"
            purchase={
                purchasePack
                    ? {
                          amount: purchasePack.amountUsd,
                          amounts: POLLEN_PACKS.map((pack) => pack.amountUsd),
                          onAmountChange: setSelectedPack,
                          priceLabel: formatUsdCentsCompact(
                              purchasePack.amountUsd * 100 +
                                  calculateServiceFeeCents(
                                      purchasePack.amountUsd * 100,
                                  ),
                          ),
                          feeLabel: `incl. ${formatUsdCentsCompact(calculateServiceFeeCents(purchasePack.amountUsd * 100))} fee`,
                      }
                    : undefined
            }
            account={{
                name: "moss.exe",
                avatarUrl: "/pollen-connect-preview/moss.png",
                paid: simulation
                    ? balance - Number(params.get("sim_quest"))
                    : balance,
                quest: simulation ? Number(params.get("sim_quest")) : 0,
            }}
            checkoutPack={
                confirmationError ||
                scenario === "loading" ||
                scenario === "balance-unavailable"
                    ? undefined
                    : plan.shortfall > 0
                      ? plan.pack?.amountUsd
                      : null
            }
            budget={scenario === "balance-unavailable" ? undefined : budget}
            busy={scenario === "starting" || scenario === "confirming"}
            error={confirmationError ?? error}
            pending={stage === "pending"}
            onAmountChange={setAmount}
            onPurchase={() => {
                completed.current = false;
                if (scenario === "start-error")
                    setError("Could not start top-up.");
                else if (purchasePack) setStage("checkout");
            }}
            onContinue={() => {
                if (scenario === "start-error")
                    setError("Could not start top-up.");
                else if (scenario === "confirm-error")
                    setError("Could not save the budget.");
                else if (plan.shortfall === 0) finish(false);
                else setError("Top up your account before saving this budget.");
            }}
            onCheck={() => {
                if (scenario === "status-error")
                    setError("Could not check the top-up.");
                else if (scenario !== "pending") finish(true);
            }}
            onClose={() => {
                setStage("play");
                if (simulation)
                    document.dispatchEvent(new Event("connect-lab-close"));
            }}
        />
    );
    if (stage === "amount") return allowanceDialog;
    if (stage === "checkout")
        return (
            <ProviderScreen provider="stripe">
                <Surface variant="card" className="provider-checkout-card">
                    <h1 className="text-xl font-semibold font-body">
                        Review purchase
                    </h1>
                    {error && <ErrorBanner>{error}</ErrorBanner>}
                    <div className="provider-checkout-summary">
                        <strong>
                            {(simulation && initialStage === "checkout") ||
                            accountPurchase
                                ? Number(params.get("sim_pack") ?? 5)
                                : purchasePack?.amountUsd}{" "}
                            Pollen pack
                        </strong>
                        <p className="mt-2 text-sm">
                            Added to your account after payment. The final
                            price, fees and tax are shown in Stripe.
                        </p>
                    </div>
                    {accountPurchase &&
                        params.get("sim_payment") === "pending" && (
                            <output>Payment pending.</output>
                        )}
                    <div className="provider-checkout-actions">
                        <Button
                            onClick={() => {
                                if (accountPurchase) {
                                    returnToAccount();
                                    return;
                                }
                                setStage("play");
                            }}
                            className="provider-cancel"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="provider-pay"
                            onClick={() =>
                                accountPurchase
                                    ? returnToAccount(
                                          Number(params.get("sim_pack") ?? 5),
                                      )
                                    : scenario === "pending" ||
                                        scenario === "status-error"
                                      ? setStage("pending")
                                      : finish(true)
                            }
                        >
                            {accountPurchase &&
                            params.get("sim_payment") === "pending"
                                ? "Check payment"
                                : "Pay"}
                        </Button>
                    </div>
                </Surface>
            </ProviderScreen>
        );
    return (
        <main className="connect-developer-app" data-theme="accent">
            {stage === "connect" ? (
                <PollinationsConnectionPanel
                    error={params.get("app_callback") === "error"}
                    pending={params.get("app_callback") === "waiting"}
                    onRetry={
                        params.get("app_callback") === "check-error"
                            ? () => {
                                  const next = new URL(location.href);
                                  next.searchParams.set(
                                      "app_callback",
                                      "waiting",
                                  );
                                  location.href = next.href;
                              }
                            : undefined
                    }
                >
                    <PollinationsSignInButton
                        onClick={() => {
                            const params = new URLSearchParams(location.search);
                            params.set("screen", "oauth-signed-out");
                            params.set("app_title", "App example");
                            location.href = `/pollen-connect-screen.html?${params}`;
                        }}
                    />
                </PollinationsConnectionPanel>
            ) : (
                <PollinationsConnectionPanel
                    accountState={
                        params.get("app_account") as AppAccountState | undefined
                    }
                    onRetryAccount={() => {
                        const next = new URL(location.href);
                        next.searchParams.set("app_account", "loading");
                        location.href = next.href;
                    }}
                >
                    <AppUserMenuView
                        name="moss.exe"
                        avatarUrl="/pollen-connect-preview/moss.png"
                        remaining={Number.isFinite(budget) ? budget : undefined}
                        dashboardHref={`/pollen-connect-screen.html?${dashboardParams}`}
                        onAddPollen={startAdding}
                        onDisconnect={() => setStage("connect")}
                        labels={{ appUserMenu: "App account menu" }}
                    />
                </PollinationsConnectionPanel>
            )}
            {allowanceDialog}
        </main>
    );
}
