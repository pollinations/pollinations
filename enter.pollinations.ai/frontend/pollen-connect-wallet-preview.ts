import { calculateServiceFeeCents } from "@shared/pollen-packs.ts";
import type { ScreenVariant } from "./pollen-connect-canvas-data";
import type { BillingState } from "./src/components/pollen/auto-top-up-panel";

// Both wallet routes expose the same real billing controls and preview states.
export const walletBillingVariants: ScreenVariant[] = [
    {
        label: "Auto top-up setup",
        params: { billing_case: "setup", action: "billing-setup" },
    },
    {
        label: "Auto top-up ready",
        params: { billing_case: "ready", action: "billing-setup" },
    },
    { label: "Auto top-up enabled", params: { billing_case: "enabled" } },
    {
        label: "Saving auto top-up",
        params: {
            billing_case: "ready",
            action: "billing-save",
            result: "waiting",
        },
    },
    {
        label: "Auto top-up save failed",
        params: {
            billing_case: "ready",
            action: "billing-save",
            result: "error",
        },
    },
    { label: "Last charge failed", params: { billing_case: "failed" } },
    { label: "Payment action required", params: { billing_case: "payment" } },
    {
        label: "Opening billing",
        params: {
            billing_case: "enabled",
            action: "billing-portal",
            result: "waiting",
        },
    },
    {
        label: "Billing handoff failed",
        params: {
            billing_case: "enabled",
            action: "billing-portal",
            result: "error",
        },
    },
    {
        label: "Billing unavailable",
        params: { billing_case: "unavailable", action: "billing-setup" },
    },
];

export function createWalletFixture(query: URLSearchParams) {
    const scenario = query.get("billing_case") ?? "setup";
    const ready = !["setup", "unavailable"].includes(scenario);
    const portalScreen =
        query.get("dashboard_preview") === "1"
            ? "dash-billing"
            : "account-billing";
    const portalUrl = () => {
        const params = new URLSearchParams(query);
        params.set("screen", portalScreen);
        params.delete("action");
        params.delete("result");
        return `/pollen-connect-screen.html?${params}`;
    };
    const initialPack = Number(query.get("billing_pack") ?? 10);
    let billing: BillingState = {
        autoTopUp: {
            enabled: ["enabled", "failed", "payment"].includes(scenario),
            thresholdPollen: 5,
            packAmountUsd: initialPack,
            serviceFeeCents: calculateServiceFeeCents(initialPack * 100),
            lastIssue:
                scenario === "failed"
                    ? {
                          kind: "failed",
                          reason: "Payment failed",
                          occurredAt: "2026-09-01T00:00:00Z",
                      }
                    : scenario === "payment"
                      ? {
                            kind: "pending_payment",
                            invoiceUrl: portalUrl(),
                            occurredAt: "2026-09-01T00:00:00Z",
                        }
                      : null,
        },
        paymentMethod: {
            hasDefault: ready,
            brand: ready ? "Visa" : null,
            last4: ready ? "4242" : null,
        },
        billingDetails: ready
            ? {
                  name: "Preview user",
                  email: "user@example.test",
                  line1: "Example street 1",
                  line2: null,
                  city: "Berlin",
                  state: null,
                  postalCode: "10115",
                  country: "DE",
              }
            : null,
        billingDetailsComplete: ready,
    };
    const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    return (url: URL, method: string, body: Record<string, unknown>) => {
        if (method === "GET" && url.pathname === "/api/stripe/billing")
            return json(scenario === "unavailable" ? null : billing);
        const save =
            method === "PATCH" && url.pathname === "/api/stripe/auto-top-up";
        const portal =
            method === "POST" && url.pathname === "/api/stripe/billing/portal";
        if (!save && !portal) return;
        if (query.get("result") === "waiting")
            return new Promise<Response>(() => {});
        if (query.get("result") === "error") {
            query.delete("result");
            return json({ message: "Request failed. Try again." }, 503);
        }
        if (portal) return json({ url: portalUrl() });
        const packAmountUsd = Number(body.packAmountUsd);
        billing = {
            ...billing,
            autoTopUp: {
                ...billing.autoTopUp,
                enabled: body.enabled === true,
                packAmountUsd,
                serviceFeeCents: calculateServiceFeeCents(packAmountUsd * 100),
                lastIssue: null,
            },
        };
        query.set(
            "billing_case",
            billing.autoTopUp.enabled ? "enabled" : "ready",
        );
        query.set("billing_pack", String(packAmountUsd));
        return json(billing);
    };
}

export function installWalletDriver(query: URLSearchParams) {
    const action = query.get("action");
    if (!action?.startsWith("billing-")) return;
    let opened = false;
    const run = setInterval(() => {
        const buttons = [
            ...document.querySelectorAll<HTMLButtonElement>("button"),
        ].filter((button) => button.getClientRects().length);
        if (!opened) {
            const toggle = buttons.find(
                (button) =>
                    button.getAttribute("aria-label") === "Enable auto top-up",
            );
            if (toggle) {
                toggle.click();
                opened = true;
                if (action === "billing-setup") clearInterval(run);
                return;
            }
            if (
                buttons.some(
                    (button) =>
                        button.getAttribute("aria-label") ===
                        "Turn off auto top-up",
                )
            )
                opened = true;
        }
        const label = action === "billing-save" ? "Save" : "Manage billing";
        const target = buttons.find(
            (button) =>
                button.textContent?.trim() === label && !button.disabled,
        );
        if (opened && target) {
            clearInterval(run);
            target.click();
        }
    }, 100);
    setTimeout(() => clearInterval(run), 10000);
}
