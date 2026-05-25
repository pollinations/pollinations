import { parseScopeList } from "@shared/auth/authorize-config.ts";
import { createFileRoute } from "@tanstack/react-router";
import { Authorize } from "../components/auth/authorize.tsx";

function parseList(val: unknown): string[] | null {
    if (!val || typeof val !== "string") return null;
    const items = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return items.length ? items : null;
}

function parseNumber(val: unknown): number | null {
    if (!val) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

export const Route = createFileRoute("/authorize")({
    component: Authorize,
    validateSearch: (search: Record<string, unknown>) => {
        const result: {
            redirect_url?: string;
            user_code?: string;
            app_key?: string;
            state?: string;
            models?: string[] | null;
            budget?: number | null;
            expiry?: number | null;
            scope?: string[] | null;
        } = {
            // Canonical OAuth name is `redirect_uri`; keep `redirect_url`
            // as a legacy alias so existing apps keep working.
            redirect_url:
                (search.redirect_uri as string) ||
                (search.redirect_url as string) ||
                "",
        };

        if (search.user_code && typeof search.user_code === "string") {
            result.user_code = search.user_code;
        }

        // Canonical OAuth name is `client_id`; `app_key` is a legacy alias.
        const appKey =
            (search.client_id as string) || (search.app_key as string);
        if (appKey && typeof appKey === "string") {
            result.app_key = appKey;
        }

        // OAuth `state` — echoed back on the callback so the caller can
        // correlate the response and defeat CSRF.
        if (search.state && typeof search.state === "string") {
            result.state = search.state;
        }

        const models = parseList(search.models);
        if (models !== null) result.models = models;

        const budget = parseNumber(search.budget);
        if (budget !== null) result.budget = budget;

        const expiry = parseNumber(search.expiry);
        if (expiry !== null) result.expiry = expiry;

        // Canonical OAuth name is `scope` (space-separated); `permissions`
        // (comma-separated) is a legacy alias. parseScopeList accepts either
        // separator. Router normalizes the URL to the canonical `scope` name.
        const scope =
            parseScopeList(search.scope) ?? parseList(search.permissions);
        if (scope !== null) result.scope = scope;

        return result;
    },
});
