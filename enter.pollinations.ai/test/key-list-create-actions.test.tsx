import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ApiKeyList } from "../frontend/src/components/keys/api-key-list.tsx";
import type { ApiKey } from "../frontend/src/components/keys/types.ts";

// The list mounts dialogs that read `window` and `import.meta.env.MODE` at
// module scope through config.ts.
vi.hoisted(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubEnv("MODE", "development");
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const noop = async () => {};

function key(overrides: Partial<ApiKey> = {}): ApiKey {
    return {
        id: overrides.id ?? "key",
        name: overrides.name ?? "key",
        createdAt: "2026-01-01T00:00:00.000Z",
        permissions: null,
        metadata: { keyType: "secret" },
        ...overrides,
    };
}

const secretKey = (id: string) => key({ id, metadata: { keyType: "secret" } });
const appKey = (id: string) =>
    key({
        id,
        metadata: {
            keyType: "publishable",
            redirectUris: ["https://app.example/callback"],
        },
    });

function sectionHtml(html: string, id: string): string {
    const match = html.match(
        new RegExp(`<section id="${id}"[\\s\\S]*?</section>`),
    );
    if (!match) throw new Error(`Section ${id} not found`);
    return match[0];
}

const count = (html: string, ariaLabel: string) =>
    html.split(`aria-label="${ariaLabel}"`).length - 1;

function render(apiKeys: ApiKey[]): string {
    return renderToStaticMarkup(
        <ApiKeyList
            apiKeys={apiKeys}
            onCreate={noop}
            onUpdate={noop}
            onDelete={noop}
        />,
    );
}

describe("key list create actions", () => {
    it("keeps both create buttons for an account with only secret keys", () => {
        const html = render([secretKey("s1")]);
        const secrets = sectionHtml(html, "api-keys");
        const apps = sectionHtml(html, "app-keys");

        expect(count(secrets, "Create secret key")).toBe(1);
        expect(count(apps, "Create app key")).toBe(1);
    });

    it("keeps both create buttons for an account with only app keys", () => {
        const html = render([appKey("a1")]);
        const secrets = sectionHtml(html, "api-keys");
        const apps = sectionHtml(html, "app-keys");

        expect(count(secrets, "Create secret key")).toBe(1);
        expect(count(apps, "Create app key")).toBe(1);
    });

    it("shows each empty-state action only once when both kinds exist", () => {
        const html = render([secretKey("s1"), appKey("a1")]);
        const secrets = sectionHtml(html, "api-keys");
        const apps = sectionHtml(html, "app-keys");

        expect(count(secrets, "Create secret key")).toBe(1);
        expect(count(apps, "Create app key")).toBe(1);
    });
});
