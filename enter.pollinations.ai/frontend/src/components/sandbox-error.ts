import type { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { readError } from "./community-endpoints/types.ts";

const paymentActions = {
    KEY_BUDGET_EXHAUSTED: {
        message: "This key’s remaining budget can’t cover the sandbox lease.",
        label: "Review key budget",
        href: "/edit-key",
    },
    QUEST_POLLEN_ONLY: {
        message:
            "This key only spends Quest balance, which can’t cover the sandbox lease.",
        label: "Allow paid balance",
        href: "/edit-key",
    },
    QUEST_POLLEN_RESTRICTED: {
        message: "Your Quest balance is locked. Your first top-up unlocks it.",
        label: "Top up",
        href: "/top-up",
    },
    INSUFFICIENT_BALANCE: {
        message:
            "Neither your Quest nor your paid balance can cover this lease.",
        label: "Top up paid balance",
        href: "/top-up",
    },
} as const satisfies Record<
    PaymentRequiredError["errorCode"],
    { message: string; label: string; href: string }
>;

// Take only the local recovery path and its relevant query params from Gen.
function recoveryHref(
    path: "/top-up" | "/edit-key",
    fixUrl: unknown,
    origin: string,
): string {
    const fallback = path === "/edit-key" ? "/keys" : path;
    if (typeof fixUrl !== "string" || !URL.canParse(fixUrl, origin))
        return fallback;
    const url = new URL(fixUrl, origin);
    if (
        url.pathname !== path ||
        (url.origin !== origin &&
            !Object.values(PUBLIC_URLS.enter).some(
                (enter) => enter === url.origin,
            ))
    )
        return fallback;

    const params = new URLSearchParams();
    if (path === "/edit-key") {
        const id = url.searchParams.get("id");
        if (!id) return fallback;
        params.set("id", id);
    }
    const ref = url.searchParams.get("ref");
    if (ref?.startsWith("agent_") || ref === "quest_pollen_restricted")
        params.set("ref", ref);
    return params.size ? `${path}?${params}` : path;
}

export type SandboxError = Error & {
    recovery?: { label: string; href: string };
};

export async function sandboxError(
    response: Response,
    origin: string,
): Promise<SandboxError> {
    if (response.status === 402) {
        const body = await response
            .clone()
            .json<{ reason?: keyof typeof paymentActions; fixUrl?: string }>()
            .catch(() => null);
        if (
            typeof body?.reason === "string" &&
            Object.hasOwn(paymentActions, body.reason)
        ) {
            const { message, label, href } = paymentActions[body.reason];
            return Object.assign(new Error(message), {
                recovery: {
                    label,
                    href: recoveryHref(href, body.fixUrl, origin),
                },
            });
        }
    }
    return new Error(await readError(response));
}
