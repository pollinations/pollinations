import type { AuthenticatedApiKey } from "@shared/auth/api-key.ts";
import type { UserBalance } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import { fixLink, type RefusalContext } from "@shared/http/fix-link.ts";
import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";

/** The app to return to after a fix: the key's app, else the page that sent the request. */
export function appOrigin(
    apiKey: Pick<AuthenticatedApiKey, "metadata"> | undefined,
    referer: string | undefined,
): string | undefined {
    const stored = apiKey?.metadata?.redirectOrigin;
    if (typeof stored === "string") return stored;
    if (!referer) return undefined;
    try {
        return new URL(referer).origin;
    } catch {
        return undefined;
    }
}

const preciseDollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: POLLEN_BILLING_PRECISION,
});

/** Match the ledger precision when rounding would hide the gap that caused a refusal. */
function usd(amount: number, ...compared: number[]): string {
    const value = Math.max(0, amount);
    const rounded = value.toFixed(4);
    if (
        value > 0 &&
        compared.some(
            (other) =>
                other > 0 && other !== value && other.toFixed(4) === rounded,
        )
    ) {
        return value < 10 ** -POLLEN_BILLING_PRECISION
            ? "less than $0.00000001"
            : preciseDollars.format(value);
    }
    return value > 0 && Number(rounded) === 0
        ? "less than $0.0001"
        : `$${rounded}`;
}

function keyBudgetLink(c: RefusalContext): string {
    return fixLink(c, "/edit-key", {
        id: c.var.auth?.apiKey?.id,
        ref: "agent_key_budget",
    });
}

export function keyReservationFailed(c: RefusalContext): PaymentRequiredError {
    const url = keyBudgetLink(c);
    return new PaymentRequiredError(
        "KEY_BUDGET_EXHAUSTED",
        (link) =>
            `Key budget unavailable. If other requests are running, wait for them to finish and try again. ${link("Review the key budget", url)}.`,
        url,
    );
}

/** Check the key first. Topping up the account cannot raise its spending limit. */
export async function requireFunds(
    c: RefusalContext,
    cost: number,
    loadBalance: () => Promise<UserBalance>,
    {
        paidOnly = false,
        free = false,
        realtimeMedian = false,
        knownPrice = false,
    } = {},
): Promise<UserBalance> {
    const apiKey = c.var.auth?.apiKey;
    const budget = apiKey?.pollenBalance;
    function requirement(
        funds:
            | "key budget"
            | "paid balance"
            | "Quest balance"
            | "Quest or paid balance",
        showBalances: boolean,
        ...balances: number[]
    ) {
        if (cost <= 0) {
            if (free) {
                return funds === "key budget"
                    ? "Free requests need a key budget of zero or more."
                    : `Free requests need a positive ${funds}.`;
            }
            return `A positive ${funds} is required. Final cost depends on usage.${realtimeMedian ? " Nothing was charged." : ""}`;
        }
        const price = showBalances ? usd(cost, ...balances) : usd(cost);
        const rounded =
            price === `$${cost.toFixed(4)}` && Number(cost.toFixed(4)) !== cost;
        const amount = rounded ? `about ${price}` : price;
        if (realtimeMedian) {
            const threshold =
                funds === "paid balance"
                    ? "Your paid balance must exceed"
                    : "Opening a session needs";
            const source =
                funds === "Quest or paid balance" ? " in one balance" : "";
            return `${threshold} ${amount}${source} (7-day median for this model). Nothing was charged.`;
        }
        if (funds === "paid balance") {
            return knownPrice
                ? `Your paid balance must exceed ${amount} to start.`
                : `Your paid balance must exceed the estimate of ${amount}.`;
        }
        if (funds === "Quest or paid balance")
            return knownPrice
                ? `One balance must cover ${amount} to start.`
                : `One balance must cover the estimate of ${amount}.`;
        return knownPrice
            ? `This request needs ${amount} to start.`
            : `The estimated cost is ${price}.`;
    }
    if (
        typeof budget === "number" &&
        (budget < Math.max(0, cost) || (budget <= 0 && !free))
    ) {
        const url = keyBudgetLink(c);
        throw new PaymentRequiredError(
            "KEY_BUDGET_EXHAUSTED",
            (link, showBalances) => {
                const available =
                    budget < 0
                        ? "This key is over budget."
                        : showBalances
                          ? `This key has ${usd(budget, cost)} left.`
                          : "This key has too little budget left.";
                return `${available} ${requirement("key budget", showBalances, budget)} ${link("Raise the key budget", url)}.`;
            },
            url,
        );
    }

    const balance = await loadBalance();
    const questOnly = apiKey?.questPollenOnly ?? false;
    const spendable = questOnly ? { ...balance, packBalance: 0 } : balance;
    if (canCoverEstimatedCharge(spendable, cost, paidOnly)) return balance;

    const allowPaidUrl = fixLink(c, "/edit-key", {
        id: apiKey?.id,
        ref: "agent_quest_pollen_only",
    });
    if (balance.questPollenRestricted) {
        const url = fixLink(c, "/top-up", { ref: "quest_pollen_restricted" });
        throw new PaymentRequiredError(
            "QUEST_POLLEN_RESTRICTED",
            (link) => {
                const unlock = link("Top up", url);
                const support = link(
                    "contact support",
                    "mailto:hello@pollinations.ai",
                );
                const model = paidOnly
                    ? " This model needs the paid balance."
                    : "";
                const edit = questOnly
                    ? ` ${link("Allow paid balance", allowPaidUrl)} for this key to use paid funds.`
                    : "";
                return `We couldn't verify this account. Its Quest balance is locked. ${unlock} to unlock it, or ${support}.${model}${edit}`;
            },
            url,
            true,
        );
    }

    const topUp = fixLink(c, "/top-up", { ref: "agent_low_balance_topup" });
    const quests = fixLink(c, "/quests", {
        ref: questOnly
            ? "agent_quest_pollen_only_quests"
            : "agent_low_balance_quests",
    });
    if (questOnly) {
        throw new PaymentRequiredError(
            "QUEST_POLLEN_ONLY",
            (link, showBalances) => {
                if (paidOnly)
                    return `This model needs the paid balance. This key only spends Quest balance. ${link("Allow paid balance", allowPaidUrl)} for this key.`;
                const remaining = showBalances
                    ? ` It has ${usd(balance.tierBalance, cost)} available.`
                    : "";
                return `This key only spends Quest balance.${remaining} ${requirement("Quest balance", showBalances, balance.tierBalance)} ${link("Complete a Quest", quests)} or ${link("allow paid balance", allowPaidUrl)}.`;
            },
            allowPaidUrl,
            paidOnly,
        );
    }

    throw new PaymentRequiredError(
        "INSUFFICIENT_BALANCE",
        (link, showBalances) => {
            if (paidOnly) {
                const remaining = showBalances
                    ? ` You have ${usd(balance.packBalance, cost)} there.`
                    : "";
                return `This model needs the paid balance.${remaining} ${requirement("paid balance", showBalances, balance.packBalance)} ${link("Top up", topUp)}.`;
            }
            const remaining = showBalances
                ? ` You have ${usd(balance.tierBalance, cost)} in Quest balance and ${usd(balance.packBalance, cost)} in paid balance.`
                : "";
            return `${requirement("Quest or paid balance", showBalances, balance.tierBalance, balance.packBalance)}${remaining} ${link("Complete a Quest", quests)} or ${link("top up", topUp)}.`;
        },
        topUp,
        paidOnly,
    );
}
