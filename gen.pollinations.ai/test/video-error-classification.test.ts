import { describe, expect, it } from "vitest";
import { classifyByteplusError } from "@/image/models/seedanceVideoModel.ts";
import {
    classifyReplicateHttpStatus,
    classifyReplicatePredictionError,
} from "@/image/utils/replicateClient.ts";

describe("classifyReplicateHttpStatus", () => {
    it("passes through 429 so clients can back off", () => {
        expect(classifyReplicateHttpStatus(429)).toBe(429);
    });

    it("maps 5xx to 502 (upstream failure)", () => {
        expect(classifyReplicateHttpStatus(500)).toBe(502);
        expect(classifyReplicateHttpStatus(502)).toBe(502);
        expect(classifyReplicateHttpStatus(503)).toBe(502);
    });

    it("maps infra-side 4xx to 502 (our config, not user input)", () => {
        expect(classifyReplicateHttpStatus(401)).toBe(502);
        expect(classifyReplicateHttpStatus(403)).toBe(502);
        expect(classifyReplicateHttpStatus(422)).toBe(502);
    });
});

describe("classifyReplicatePredictionError", () => {
    it("maps Seedance E005 sensitive content to 400", () => {
        expect(
            classifyReplicatePredictionError(
                "ModelError: The input or output was flagged as sensitive. Please try again with different inputs. (E005) (uIJ6l3ruRD)",
            ),
        ).toBe(400);
    });

    it("maps 'flagged as sensitive' (no E005) to 400", () => {
        expect(
            classifyReplicatePredictionError(
                "Output was flagged as sensitive content",
            ),
        ).toBe(400);
    });

    it("maps Replicate input-fetch failures to 400", () => {
        expect(
            classifyReplicatePredictionError(
                "Input validation error: 403 Client Error: Forbidden for url: https://wsrv.nl/?url=...",
            ),
        ).toBe(400);
    });

    it("defaults unknown failures to 500", () => {
        expect(classifyReplicatePredictionError("CUDA out of memory")).toBe(
            500,
        );
        expect(classifyReplicatePredictionError("Prediction failed")).toBe(500);
    });
});

describe("classifyByteplusError", () => {
    it("maps NSFW output rejection to 400", () => {
        expect(
            classifyByteplusError({
                code: "OutputAudit",
                message:
                    "The request failed because the output video may contain sensitive information. Request id: 02177...",
            }),
        ).toBe(400);
    });

    it("maps content filter mentions to 400", () => {
        expect(
            classifyByteplusError({
                message: "Blocked by content filter",
            }),
        ).toBe(400);
        expect(
            classifyByteplusError({
                message: "Rejected: violates content policy",
            }),
        ).toBe(400);
    });

    it("maps unfetchable reference image to 422", () => {
        expect(
            classifyByteplusError({
                message:
                    "Failed to process reference image: Failed to fetch image: 522 <none>",
            }),
        ).toBe(422);
        expect(
            classifyByteplusError({
                message:
                    "Failed to process reference image: Failed to fetch image: 403 Forbidden",
            }),
        ).toBe(422);
    });

    it("uses numeric error.code as fallback when in HTTP range", () => {
        expect(
            classifyByteplusError({ code: 429, message: "rate limited" }),
        ).toBe(429);
        expect(classifyByteplusError({ code: 503, message: "down" })).toBe(503);
    });

    it("ignores numeric error.code outside HTTP range (BytePlus's own scheme)", () => {
        expect(classifyByteplusError({ code: 1709, message: "unknown" })).toBe(
            500,
        );
        expect(classifyByteplusError({ code: 100, message: "unknown" })).toBe(
            500,
        );
    });

    it("ignores string error.code", () => {
        expect(
            classifyByteplusError({
                code: "InvalidParameter",
                message: "unknown",
            }),
        ).toBe(500);
    });

    it("defaults unknown failures to 500", () => {
        expect(classifyByteplusError({ message: "unknown error" })).toBe(500);
        expect(classifyByteplusError(undefined)).toBe(500);
        expect(classifyByteplusError({})).toBe(500);
    });

    it("prioritizes content filter over numeric code", () => {
        expect(
            classifyByteplusError({
                code: 500,
                message: "output may contain sensitive information",
            }),
        ).toBe(400);
    });
});
