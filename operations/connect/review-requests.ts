import { getDefaultErrorMessage, getErrorCode } from "../../shared/error.ts";
export const reviewErrorStatuses = {
    "server-error": 500,
    unavailable: 503,
    unauthorized: 401,
    forbidden: 403,
} as const;

export type ReviewRequest = {
    path: string;
    method?: string;
    outcome: "pending" | keyof typeof reviewErrorStatuses;
};

export function describeReviewRequest(rule: ReviewRequest): string {
    const request = `${rule.method ?? "GET"} ${rule.path}`;
    return rule.outcome === "pending"
        ? `Held request: ${request}`
        : `Injected HTTP ${reviewErrorStatuses[rule.outcome]}: ${request} (shared default response, not an endpoint-generated error)`;
}

export function parseReviewRequests(value: unknown): ReviewRequest[] {
    if (!Array.isArray(value) || value.length > 8)
        throw new Error("Expected local review requests");
    for (const rule of value) {
        if (
            !rule ||
            typeof rule !== "object" ||
            Object.keys(rule).some(
                (key) => !["path", "method", "outcome"].includes(key),
            ) ||
            typeof rule.path !== "string" ||
            rule.path.includes("..") ||
            !/^\/(api|gen|auth)\/[a-zA-Z0-9_./*-]+$/.test(rule.path) ||
            (rule.method !== undefined &&
                !["GET", "POST", "PATCH", "DELETE"].includes(rule.method)) ||
            (rule.outcome !== "pending" &&
                !Object.hasOwn(reviewErrorStatuses, rule.outcome))
        )
            throw new Error("Invalid local review request");
    }
    return value;
}

// Only Connect's transport knows about review conditions. Enter and Gen keep
// their real response handling, loaders, forms and recovery behavior.
export function createReviewRequests() {
    let rules: ReviewRequest[] = [];
    const consumed = new Map<string, ReviewRequest>();
    function configure(value: unknown) {
        rules = parseReviewRequests(value).map((rule) => ({ ...rule }));
    }
    return {
        configure,
        reset() {
            configure([]);
            consumed.clear();
        },
        evidence() {
            return { pending: rules, consumed: [...consumed.values()] };
        },
        async intercept(request: Request): Promise<Response | undefined> {
            const path = new URL(request.url).pathname;
            const rule = rules.find((rule) => {
                const pattern = rule.path.split("*");
                return (
                    request.method === (rule.method ?? "GET") &&
                    (pattern.length === 1
                        ? path === rule.path
                        : path.startsWith(pattern[0]) &&
                          path.endsWith(pattern.at(-1) ?? ""))
                );
            });
            if (!rule) return;
            consumed.set(JSON.stringify(rule), rule);
            if (rule.outcome === "pending") {
                // The originating page owns this request. Changing situations
                // unmounts that page and aborts it; changing rules must never
                // release a held write or manufacture an HTTP error response.
                return new Promise<never>((_, reject) => {
                    const cancel = () => {
                        request.signal.removeEventListener("abort", cancel);
                        reject(
                            new DOMException("Request aborted", "AbortError"),
                        );
                    };
                    if (request.signal.aborted) cancel();
                    else
                        request.signal.addEventListener("abort", cancel, {
                            once: true,
                        });
                });
            }
            // Keep the chosen fault active until another situation is prepared.
            const status = reviewErrorStatuses[rule.outcome];
            const message = getDefaultErrorMessage(status);
            const code = getErrorCode(status);
            // Better Auth endpoints use a flat error; Enter/Gen use the shared
            // envelope. These are explicit default HTTP fault injections. They
            // do not reproduce a particular endpoint's internal failure or copy.
            return Response.json(
                path.startsWith("/api/auth/")
                    ? { code: code.toUpperCase(), message }
                    : {
                          success: false,
                          error: {
                              message,
                              code,
                              timestamp: new Date().toISOString(),
                          },
                          status,
                      },
                { status, headers: { "Cache-Control": "no-store" } },
            );
        },
    };
}
