import {
    getDefaultErrorMessage,
    getErrorCode,
    KNOWN_ERROR_STATUS_CODES,
    remapUpstreamStatus,
} from "@shared/error.ts";
import { expect, test } from "vitest";

test("classifies provider timeouts as gateway timeouts", () => {
    expect(remapUpstreamStatus(408)).toBe(504);
});

test.each([
    [408, "REQUEST_TIMEOUT"],
    [410, "GONE"],
    [413, "PAYLOAD_TOO_LARGE"],
    [426, "UPGRADE_REQUIRED"],
    [504, "GATEWAY_TIMEOUT"],
] as const)("publishes a usable error code and message for %s", (status, code) => {
    expect(getErrorCode(status)).toBe(code);
    expect(getDefaultErrorMessage(status)).not.toBe("UNKNOWN_ERROR");
    expect(KNOWN_ERROR_STATUS_CODES).toContain(status);
});

test("maps upstream payment failures to bad gateway", () => {
    expect(remapUpstreamStatus(402)).toBe(502);
});

test("preserves upstream unsupported media type errors", () => {
    expect(remapUpstreamStatus(415)).toBe(415);
});

test("maps upstream Cloudflare timeouts to bad gateway", () => {
    expect(remapUpstreamStatus(524)).toBe(502);
});
