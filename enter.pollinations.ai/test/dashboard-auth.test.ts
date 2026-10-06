import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test("dashboard origins cannot read Enter's session cross-origin", async () => {
    for (const origin of [
        "https://kpi.pollinations.ai",
        "https://economics.pollinations.ai",
        "https://observability.pollinations.ai",
    ]) {
        const response = await SELF.fetch(
            "http://localhost:3000/api/auth/get-session",
            { headers: { Origin: origin } },
        );
        expect(
            response.headers.get("Access-Control-Allow-Credentials"),
        ).not.toBe("true");
    }
});

test("Enter no longer serves satellite dashboard data", async () => {
    for (const path of [
        "kpi/registrations",
        "economics/pipes/economics_bank_ledger_api",
    ]) {
        const response = await SELF.fetch(
            `http://localhost:3000/api/dashboards/${path}`,
        );
        expect(response.status).toBe(404);
    }
});
