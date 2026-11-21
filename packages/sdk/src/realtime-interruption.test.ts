import { describe, expect, it, vi } from "vitest";
import {
    createInterruptionController,
    handleBargeIn,
} from "./realtime-interruption.js";

describe("realtime-interruption", () => {
    it("cancel response", () => {
        const c = createInterruptionController();
        expect(c.cancelResponse()).toEqual({ type: "response.cancel" });
        expect(c.isInterrupted()).toBe(true);
    });
    it("markInterrupted", () => {
        const c = createInterruptionController();
        c.markInterrupted(false);
        expect(c.isInterrupted()).toBe(false);
    });
    it("handleBargeIn calls onInterrupt", () => {
        const c = createInterruptionController();
        const cb = vi.fn();
        handleBargeIn(c, cb);
        expect(cb).toHaveBeenCalled();
    });
});
