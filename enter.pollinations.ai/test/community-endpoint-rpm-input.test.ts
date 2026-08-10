import { describe, expect, it } from "vitest";
import {
    emptyForm,
    isValidPerUserRpm,
    toEndpointPayload,
} from "../frontend/src/components/community-endpoints/types.ts";

describe("community endpoint per-user RPM input", () => {
    it("serializes an exact limit or no limit", () => {
        expect(
            toEndpointPayload({ ...emptyForm, perUserRpm: "12" }).perUserRpm,
        ).toBe(12);
        expect(toEndpointPayload(emptyForm).perUserRpm).toBeNull();
    });

    it("accepts only positive whole numbers", () => {
        expect(isValidPerUserRpm("1")).toBe(true);
        expect(isValidPerUserRpm("1.5")).toBe(false);
        expect(isValidPerUserRpm("0")).toBe(false);
    });
});
