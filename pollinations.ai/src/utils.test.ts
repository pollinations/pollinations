import { describe, expect, it, vi } from "vitest";
import { cn, memoizeAsync } from "./utils";

describe("cn", () => {
    it("merges conditional classes and resolves Tailwind conflicts", () => {
        expect(cn("px-2", false && "hidden", "px-4", ["text-sm"])).toBe(
            "px-4 text-sm",
        );
    });
});

describe("memoizeAsync", () => {
    it("deduplicates concurrent calls with the same key", async () => {
        const fn = vi.fn(async (value: string) => `resolved:${value}`);
        const memoized = memoizeAsync(fn, (value) => value);

        const [first, second] = await Promise.all([
            memoized("same"),
            memoized("same"),
        ]);

        expect(first).toBe("resolved:same");
        expect(second).toBe("resolved:same");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("allows a later call after the pending promise settles", async () => {
        const fn = vi.fn(async (value: string) => `resolved:${value}`);
        const memoized = memoizeAsync(fn, (value) => value);

        await memoized("same");
        await memoized("same");

        expect(fn).toHaveBeenCalledTimes(2);
    });
});
