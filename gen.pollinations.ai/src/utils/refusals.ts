import { type Grant, signGrantAgent } from "@shared/auth/agent-run-token.ts";
import type { AuthenticatedApiKey } from "@shared/auth/api-key.ts";
import type { UserBalance } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import { PermissionRequiredError } from "@shared/http/permission-required-error.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import type { AuthVariables } from "@/middleware/auth.ts";

/**
 * Refusals the key's owner can fix. Each one links the enter page that fixes
 * it, and the same link goes into the error message, the JSON `fixUrl` and the
 * chat reply.
 */
export type RefusalContext = {
    env: { ENVIRONMENT?: string; BETTER_AUTH_SECRET: string };
    var: { auth?: AuthVariables["auth"] };
};

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

/** A link to an enter page on the environment that matches this gen. */
export function fixLink(
    c: RefusalContext,
    path: string,
    params: Record<string, string | undefined>,
): string {
    // app.request() tests run without env.
    const base =
        c.env?.ENVIRONMENT === "staging"
            ? PUBLIC_URLS.enter.staging
            : PUBLIC_URLS.enter.production;
    const url = new URL(path, base);
    for (const [key, value] of Object.entries({
        ...params,
        redirect: c.var.auth?.appOrigin,
    })) {
        if (value) url.searchParams.set(key, value);
    }
    return url.toString();
}

export function permissionRequired(
    c: RefusalContext,
    grant: Grant,
    reason: string,
): PermissionRequiredError {
    const id = c.var.auth?.apiKey?.id ?? "";
    // During an agent run, sign the agent's name into the link so the grant
    // page can show who asked without trusting the agent to name itself.
    const agent = c.var.auth?.agentRun?.agentModelId;
    const sig =
        agent &&
        signGrantAgent({
            secret: c.env.BETTER_AUTH_SECRET,
            apiKeyId: id,
            grant,
            agent,
        });
    const fixUrl = fixLink(c, "/grant", {
        id,
        ...grant,
        agent,
        sig,
        ref: "agent_grant",
    });
    return new PermissionRequiredError(
        `${reason} Allow it at ${fixUrl}`,
        fixUrl,
    );
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
