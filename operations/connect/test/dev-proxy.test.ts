import { describe, expect, it } from "vitest";
import configure from "../vite.live.config";

const config = configure({ command: "serve", mode: "development" });
const proxyRules = Object.keys(config.server?.proxy ?? {});
const isProxied = (url: string) =>
    proxyRules.some((rule) =>
        rule.startsWith("^")
            ? new RegExp(rule).test(url)
            : url.startsWith(rule),
    );

describe("Connect service routing", () => {
    it.each([
        "/auth/login?return_to=/connect-admin.html",
        "/auth/callback",
        "/auth/session",
        "/api/auth/get-session",
        "/gen/account/key",
        "/__connect/state",
    ])("sends %s to the local runtime", (url) => {
        expect(isProxied(url)).toBe(true);
    });

    it.each([
        "/authorize?client_id=pk_public_app",
        "/device",
        "/sign-in",
        "/connect?view=screens",
        "/edit-key",
    ])("serves Enter's frontend for %s", (url) => {
        expect(isProxied(url)).toBe(false);
    });
});
