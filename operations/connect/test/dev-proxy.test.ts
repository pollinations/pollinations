import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";
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

it("blocks private files through Vite while serving application source", async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), "connect-files-test-"),
    );
    const root = path.join(directory, "app");
    const privateFiles = [
        ".dev.vars",
        ".dev.vars.local",
        "secrets/prod.vars.json",
        ".testingtokens",
        ".local/session.sqlite",
        ".env",
        ".env.local",
        ".git/config",
        "certificate.pem",
    ];
    for (const name of ["index.html", "src/main.js", ...privateFiles]) {
        const file = path.join(root, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(
            file,
            name.endsWith(".js")
                ? "export const value = 1;"
                : "non-secret test fixture",
        );
    }
    await writeFile(
        path.join(directory, "outside.txt"),
        "outside allowed root",
    );
    const server = await createServer({
        configFile: false,
        root,
        publicDir: false,
        logLevel: "silent",
        server: {
            host: "127.0.0.1",
            port: 0,
            watch: null,
            fs: { ...config.server?.fs, allow: [root] },
        },
    });
    try {
        await server.listen();
        const origin = `http://127.0.0.1:${(server.httpServer?.address() as AddressInfo).port}`;
        for (const name of privateFiles) {
            for (const url of [`/${name}`, `/@fs/${path.join(root, name)}`]) {
                const response = await fetch(`${origin}${url}`, {
                    method: "HEAD",
                });
                expect(response.status, url).toBe(403);
            }
        }
        expect(
            (
                await fetch(
                    `${origin}/@fs/${path.join(directory, "outside.txt")}`,
                    { method: "HEAD" },
                )
            ).status,
        ).toBe(403);
        for (const url of ["/", "/src/main.js"]) {
            const response = await fetch(`${origin}${url}`);
            expect(response.status, url).toBe(200);
            await response.body?.cancel();
        }
    } finally {
        await server.close();
        await rm(directory, { recursive: true, force: true });
    }
});

it("resolves shared UI and SDK to source with only CSS compiled separately", async () => {
    const server = await createServer({
        configFile: false,
        root: config.root,
        resolve: config.resolve,
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { watch: null, middlewareMode: true },
    });
    try {
        const entries = {
            "@pollinations/sdk": "sdk/src/index.ts",
            "@pollinations/sdk/react": "sdk/src/react/index.ts",
            "@pollinations/ui": "ui/src/index.ts",
            "@pollinations/ui/markdown": "ui/src/markdown.ts",
            "@pollinations/ui/auth": "ui/src/modules/auth/index.ts",
            "@pollinations/ui/auth/sdk": "ui/src/modules/auth/sdk.ts",
            "@pollinations/ui/app-user-menu/sdk":
                "ui/src/modules/app-user-menu/sdk.ts",
            "@pollinations/ui/gen": "ui/src/modules/gen/index.ts",
            "@pollinations/ui/wallet": "ui/src/modules/wallet/index.ts",
            "@pollinations/ui/app.css": "ui/src/styles/app.css",
            "@pollinations/ui/styles.css": "ui/dist/styles.css",
            "@pollinations/ui/brand/mark.svg": "ui/src/brand/mark.svg",
            "./fonts/uncut-sans-variable.woff2":
                "ui/src/fonts/uncut-sans-variable.woff2",
        };
        for (const [specifier, source] of Object.entries(entries)) {
            const resolved =
                await server.environments.client.pluginContainer.resolveId(
                    specifier,
                );
            expect(resolved?.id, specifier).toBe(
                path.resolve(import.meta.dirname, "../../../packages", source),
            );
        }
    } finally {
        await server.close();
    }
});
