import { getDefaultErrorMessage, getErrorCode } from "../../shared/error.ts";
export type ReviewRequest = {
    path: string;
    method?: string;
    outcome: "pending" | "unavailable" | "unauthorized" | "forbidden";
};

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
            !["pending", "unavailable", "unauthorized", "forbidden"].includes(
                rule.outcome,
            )
        )
            throw new Error("Invalid local review request");
    }
    return value;
}

// Only Connect's transport knows about review conditions. Enter and Gen keep
// their real response handling, loaders, forms and recovery behavior.
export function createReviewRequests() {
    let rules: (ReviewRequest & { started?: number })[] = [];
    const releases = new Set<() => void>();
    function configure(value: unknown) {
        const next = parseReviewRequests(value);
        for (const release of releases) release();
        rules = next.map((rule) => ({ ...rule }));
    }
    return {
        configure,
        async intercept(request: Request): Promise<Response | undefined> {
            const path = new URL(request.url).pathname;
            const rule = rules.find((rule) => {
                const pattern = rule.path.split("*");
                return (
                    request.method === (rule.method ?? "GET") &&
                    (pattern.length === 1
                        ? path === rule.path
                        : path.startsWith(pattern[0]) &&
                          path.endsWith(pattern.at(-1) ?? "")) &&
                    (rule.started === undefined ||
                        Date.now() - rule.started < 1000)
                );
            });
            if (!rule) return;
            // Treat StrictMode's initial duplicate reads as one attempt. A later
            // user retry reaches the service normally.
            rule.started ??= Date.now();
            if (rule.outcome === "pending") {
                await new Promise<void>((resolve) => {
                    const release = () => {
                        clearTimeout(timer);
                        releases.delete(release);
                        resolve();
                    };
                    const timer = setTimeout(release, 15_000);
                    releases.add(release);
                    request.signal.addEventListener("abort", release, {
                        once: true,
                    });
                });
            }
            // Never forward a held write after the capture has finished.
            const status =
                rule.outcome === "unauthorized"
                    ? 401
                    : rule.outcome === "forbidden"
                      ? 403
                      : 503;
            const message = getDefaultErrorMessage(status);
            const code = getErrorCode(status);
            // Better Auth endpoints use a flat error; Enter/Gen use the shared
            // envelope. These are transport failures, not invented product states.
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
