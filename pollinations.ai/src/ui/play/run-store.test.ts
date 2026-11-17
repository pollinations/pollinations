import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunStore } from "./run-store";

type Result = { type: "image"; url: string };
const image = (url: string): Result => ({ type: "image", url });

afterEach(() => vi.restoreAllMocks());

describe("createRunStore", () => {
    it("notifies subscribers until they unsubscribe", () => {
        const store = createRunStore<Result>();
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);

        store.set({ running: "image" });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(store.get().running).toBe("image");

        unsubscribe();
        store.set({ running: null });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("revokes the old blob once when a result is replaced", () => {
        const revoke = vi
            .spyOn(URL, "revokeObjectURL")
            .mockImplementation(() => {});
        const store = createRunStore<Result>();

        store.set({ result: image("blob:a") });
        expect(revoke).not.toHaveBeenCalled();

        store.set({ result: image("blob:b") });
        expect(revoke).toHaveBeenCalledTimes(1);
        expect(revoke).toHaveBeenCalledWith("blob:a");
    });

    it("revokes the blob when the result is cleared", () => {
        const revoke = vi
            .spyOn(URL, "revokeObjectURL")
            .mockImplementation(() => {});
        const store = createRunStore<Result>();

        store.set({ result: image("blob:a") });
        store.set({ result: null });
        expect(revoke).toHaveBeenCalledWith("blob:a");
    });
});
