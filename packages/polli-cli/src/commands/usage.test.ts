import { describe, it, expect } from "vitest";

// Test helper logic extracted purely (collect + asOptArray handled inline).
import {
    resolveKeyIds,
} from "./usage.js";

// We test the pure key-name -> id resolution helpers via injected fetcher.
describe("resolveKeyIds", () => {
    // Pass a fake key-list fetcher to avoid network.
    function make(data: any) {
        const orig = globalThis.fetch;
        const fetcher = async () =>
            ({
                ok: true,
                json: async () => data,
                text: async () => JSON.stringify(data),
            } as any);
        return async (keys: string[], key: string) => {
            (globalThis as any).fetch = fetcher;
            try { return await resolveKeyIds(keys, key); }
            finally { (globalThis as any).fetch = orig; }
        };
    }

    it("passes through an id containing a digit", async () => {
        const run = make({ data: [] });
        const out = await run(["x0N8BLC47Wehah0wFIky9jFubVJHzptL"], "sk");
        expect(out.ids).toEqual(["x0N8BLC47Wehah0wFIky9jFubVJHzptL"]);
    });

    it("rejects a bare name as an id (no digits)", async () => {
        const run = make({ data: [] });
        const out = await run(["aggressive-porcupine"], "sk");
        expect(out.ids).toEqual([]);
        expect(out.errors[0]).toContain("unknown key");
    });

    it("resolves a key name via /account/keys", async () => {
        const run = make({ data: [{ id: "abc123xyz", name: "my-key", start: "sk_abc" }] });
        const out = await run(["my-key"], "sk");
        expect(out.ids).toEqual(["abc123xyz"]);
        expect(out.errors).toEqual([]);
    });

    it("returns near matches for unknown names", async () => {
        const run = make({ data: [{ id: "zz", name: "rizki-test-app", start: "pk_" }] });
        const out = await run(["rizki"], "sk");
        expect(out.ids).toEqual([]);
        expect(out.errors[0]).toContain("rizki-test-app");
    });
});
