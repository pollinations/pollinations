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

/** Display sub-cent differences at the same precision as the billing ledger. */
const dollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: POLLEN_BILLING_PRECISION,
});
function usd(amount: number): string {
    return amount > 0 && amount < 10 ** -POLLEN_BILLING_PRECISION
        ? "less than $0.00000001"
        : dollars.format(Math.max(0, amount));
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
            `This API key no longer has enough budget available for this request. If other requests are running, wait for them to finish and try again. ${link("Review the key budget", url)}.`,
        url,
    );
}

/** Check the key first. Topping up the account cannot raise its spending limit. */
export async function requireFunds(
    c: RefusalContext,
    cost: number,
    loadBalance: () => Promise<UserBalance>,
    { paidOnly = false, free = false, realtimeMedian = false } = {},
): Promise<UserBalance> {
    const apiKey = c.var.auth?.apiKey;
    const budget = apiKey?.pollenBalance;
    const estimate = (funds: "balance" | "key budget") => {
        if (free)
            return "This request is free, but the account needs a positive balance.";
        if (cost <= 0) {
            const message = `A positive ${funds} is required to start. The final price depends on usage.`;
            return realtimeMedian
                ? `${message} No charge was made for this session.`
                : message;
        }
        if (realtimeMedian)
            return `Opening a realtime session requires an estimated ${usd(cost)}, based on this model's median session price over the past seven days. No charge was made for this session.`;
        return `The estimated amount needed to start is ${usd(cost)}.`;
    };
    if (
        typeof budget === "number" &&
        (budget < Math.max(0, cost) || (budget <= 0 && !free))
    ) {
        const url = keyBudgetLink(c);
        throw new PaymentRequiredError(
            "KEY_BUDGET_EXHAUSTED",
            (link, showBalances) =>
                `This API key has ${showBalances ? `${usd(budget)} left in its budget` : "too little budget available"}. ${estimate("key budget")} ${link("Increase the key budget", url)}. Wallet top-ups only add to the account balance.`,
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
                    ? ` ${link("Allow paid balance", allowPaidUrl)} to use paid funds with this key.`
                    : "";
                return `This account's Quest balance is locked because we couldn't verify the account. ${unlock} to unlock it, or ${support} if you think this is a mistake.${model}${edit}`;
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
                const allowPaid = link("Allow paid balance", allowPaidUrl);
                if (paidOnly)
                    return `This model needs the paid balance. This API key can only spend Quest balance. ${allowPaid} for this key to use the model.`;
                const remaining = showBalances
                    ? ` The available Quest balance is ${usd(balance.tierBalance)}.`
                    : "";
                return `This API key can only spend Quest balance.${remaining} ${estimate("balance")} ${link("Complete a Quest", quests)} to earn more, or ${link("allow paid balance", allowPaidUrl)} for this key.`;
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
                    ? ` Your available paid balance is ${usd(balance.packBalance)}.`
                    : "";
                return `This model needs the paid balance.${remaining} ${estimate("balance")} ${link("Top up", topUp)} ${cost > 0 ? "so your paid balance exceeds the estimate" : "your paid balance"}.`;
            }
            const remaining = showBalances
                ? ` Your Quest balance is ${usd(balance.tierBalance)} and your paid balance is ${usd(balance.packBalance)}.`
                : "";
            return `Insufficient balance. This request needs enough funds in either the Quest balance or the paid balance to start.${remaining} ${estimate("balance")} ${link("Complete a Quest", quests)} or ${link("top up", topUp)}.`;
        },
        topUp,
        paidOnly,
    );
}
