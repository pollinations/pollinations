import type { AuthenticatedApiKey } from "@shared/auth/api-key.ts";
import type { UserBalance } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
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

/**
 * Refuses a charge the key's budget or the account's balance can't cover.
 * The budget comes first: topping up the wallet doesn't raise it.
 */
export async function requireFunds(
    c: RefusalContext,
    cost: number,
    loadBalance: () => Promise<UserBalance>,
    paidOnly = false,
): Promise<UserBalance> {
    const apiKey = c.var.auth?.apiKey;
    const charge = `This request costs ~${cost.toFixed(4)} pollen`;
    const budget = apiKey?.pollenBalance;
    if (typeof budget === "number" && budget < Math.max(0, cost)) {
        throw keyBudgetExhausted(
            c,
            `API key budget too low. ${charge}, but this key has ${Math.max(0, budget).toFixed(4)}.`,
        );
    }
    const balance = await loadBalance();
    // A Quest Pollen only key can never draw on the paid balance.
    const questPollenOnly = apiKey?.questPollenOnly ?? false;
    const spendable = questPollenOnly
        ? { ...balance, packBalance: 0 }
        : balance;
    if (canCoverEstimatedCharge(spendable, cost, paidOnly)) return balance;

    if (balance.questPollenRestricted) {
        const fixUrl = fixLink(c, "/top-up", {
            ref: "quest_pollen_restricted",
        });
        throw new PaymentRequiredError(
            "QUEST_POLLEN_RESTRICTED",
            `We couldn't verify your account, so Quest Pollen is frozen. Make your first purchase at ${fixUrl} to unlock it, or contact hello@pollinations.ai if you think this is a mistake.`,
            fixUrl,
            true,
        );
    }

    if (questPollenOnly) {
        const fixUrl = fixLink(c, "/edit-key", {
            id: apiKey?.id,
            ref: "agent_quest_pollen_only",
        });
        const allowPaid = `allow paid Pollen for this key at ${fixUrl}`;
        throw new PaymentRequiredError(
            "QUEST_POLLEN_ONLY",
            paidOnly
                ? `This model needs paid Pollen, but this API key only spends Quest Pollen. To use it, ${allowPaid}.`
                : `Not enough Quest Pollen. ${charge}, but you have ${Math.max(0, balance.tierBalance).toFixed(4)} Quest Pollen, and this API key only spends Quest Pollen. Complete a quest at ${fixLink(c, "/quests", { ref: "agent_quest_pollen_only_quests" })} or ${allowPaid}.`,
            fixUrl,
            paidOnly,
        );
    }
    const available = paidOnly
        ? balance.packBalance
        : Math.max(balance.tierBalance, balance.packBalance);
    const fixUrl = fixLink(c, "/top-up", { ref: "agent_low_balance_topup" });
    throw new PaymentRequiredError(
        "INSUFFICIENT_BALANCE",
        `Insufficient balance. ${charge}, but your available ${paidOnly ? "paid " : ""}balance is ${Math.max(0, available).toFixed(4)}. Top up at ${fixUrl}.`,
        fixUrl,
        paidOnly,
    );
}

export function keyBudgetExhausted(
    c: RefusalContext,
    reason: string,
): PaymentRequiredError {
    const fixUrl = fixLink(c, "/edit-key", {
        id: c.var.auth?.apiKey?.id,
        ref: "agent_key_budget",
    });
    return new PaymentRequiredError(
        "KEY_BUDGET_EXHAUSTED",
        `${reason} Increase the key budget at ${fixUrl}; topping up the wallet does not increase this limit.`,
        fixUrl,
    );
}
