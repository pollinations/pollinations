import { UpstreamError } from "@shared/error.ts";
import { describe, expect, it } from "vitest";
import { collectErrorData } from "@/middleware/track.ts";

describe("collectErrorData", () => {
    it("records the UpstreamError's explicit errorCode in analytics", () => {
        const error = new UpstreamError(422, {
            message: "blocked by moderation",
            errorCode: "content_policy_violation",
        });

        const data = collectErrorData(
            new Response(null, { status: 422 }),
            error,
        );

        expect(data.errorResponseCode).toBe("content_policy_violation");
    });

    it("falls back to the status-derived code when no errorCode is set", () => {
        const data = collectErrorData(
            new Response(null, { status: 500 }),
            new Error("boom"),
        );

        expect(data.errorResponseCode).toBe("INTERNAL_ERROR");
    });
});
