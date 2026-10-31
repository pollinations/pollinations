import { beforeEach, describe, expect, it, vi } from "vitest";

const gen = vi.fn();
const genText = vi.fn();
vi.mock("../../lib/api.js", () => ({ gen, genText }));

const { connectSandbox, getSandbox, killSandbox, pauseSandbox, sandboxLogs } =
    await import("./e2b.js");

const BAD_IDS = ["../keys", "abc/../../admin", "abc?x=1", "ABC", "a b", ""];

describe("sandbox id validation", () => {
    beforeEach(() => {
        gen.mockReset().mockResolvedValue({});
        genText.mockReset().mockResolvedValue("");
    });

    it.each(BAD_IDS)("rejects %j before any request is made", (id) => {
        expect(() => getSandbox(id)).toThrow(/Invalid sandbox id/);
        expect(() => killSandbox(id)).toThrow(/Invalid sandbox id/);
        expect(() => connectSandbox(id)).toThrow(/Invalid sandbox id/);
        expect(() => pauseSandbox(id)).toThrow(/Invalid sandbox id/);
        expect(() => sandboxLogs(id)).toThrow(/Invalid sandbox id/);
        expect(gen).not.toHaveBeenCalled();
        expect(genText).not.toHaveBeenCalled();
    });

    it("passes E2B and UUID style ids through unchanged", async () => {
        await getSandbox("i7xk2-abc123");
        await killSandbox("0b9c1c7e-1111-4222-8333-444455556666");
        expect(gen).toHaveBeenCalledWith("/alpha/e2b/sandboxes/i7xk2-abc123");
        expect(genText).toHaveBeenCalledWith(
            "/alpha/e2b/sandboxes/0b9c1c7e-1111-4222-8333-444455556666",
            { method: "DELETE" },
        );
    });
});
