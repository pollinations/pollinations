import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../lib/retry.js";

describe("retry", () => {
    it("should succeed on first try", async () => {
        const fn = vi.fn().mockResolvedValue("success");
        const result = await withRetry(fn);
        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure", async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new Error("429 Too Many Requests"))
            .mockResolvedValue("success");
        const result = await withRetry(fn);
        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should retry on network error", async () => {
        const fn = vi
            .fn()
            .mockRejectedValueOnce(new Error("ECONNRESET"))
            .mockResolvedValue("success");
        const result = await withRetry(fn);
        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not retry on non-retryable error", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("400 Bad Request"));
        await expect(withRetry(fn)).rejects.toThrow("400 Bad Request");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should respect maxRetries", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("429 Too Many Requests"));
        await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow();
        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("should use exponential backoff", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("429 Too Many Requests"));
        const start = Date.now();
        await withRetry(fn, { maxRetries: 2, baseDelay: 100 }).catch(() => {});
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(100 + 200); // 100 + 200 = 300ms
    });
});