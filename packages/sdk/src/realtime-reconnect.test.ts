import { describe, expect, it, vi } from "vitest";
import {
    createReconnector,
    ReconnectError,
    reconnect,
} from "./realtime-reconnect.js";

describe("reconnect", () => {
    it("returns value on first success", async () => {
        const connect = vi.fn().mockResolvedValue("ok");
        const r = await reconnect(connect, { baseDelay: 1 });
        expect(r).toEqual({ value: "ok", attempts: 1 });
        expect(connect).toHaveBeenCalledTimes(1);
    });

    it("retries then succeeds", async () => {
        const connect = vi
            .fn()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValue("ok");
        const onRetry = vi.fn();
        const r = await reconnect(connect, { baseDelay: 1, onRetry });
        expect(r.value).toBe("ok");
        expect(r.attempts).toBe(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("throws ReconnectError after maxRetries", async () => {
        const connect = vi.fn().mockRejectedValue(new Error("fail"));
        await expect(
            reconnect(connect, { maxRetries: 2, baseDelay: 1 }),
        ).rejects.toBeInstanceOf(ReconnectError);
        expect(connect).toHaveBeenCalledTimes(3);
    });

    it("respects abort signal", async () => {
        const ctrl = new AbortController();
        const connect = vi.fn().mockImplementation(async () => {
            ctrl.abort();
            throw new Error("x");
        });
        await expect(
            reconnect(connect, {
                maxRetries: 5,
                baseDelay: 1,
                signal: ctrl.signal,
            }),
        ).rejects.toBeInstanceOf(ReconnectError);
    });

    it("createReconnector returns callable", async () => {
        const connect = vi.fn().mockResolvedValue(42);
        const fn = createReconnector(connect, { baseDelay: 1 });
        const r = await fn();
        expect(r.value).toBe(42);
    });
});
