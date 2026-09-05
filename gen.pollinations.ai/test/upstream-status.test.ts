import { remapUpstreamStatus } from "@shared/error.ts";
import { expect, test } from "vitest";

test("maps upstream payment failures to bad gateway", () => {
    expect(remapUpstreamStatus(402)).toBe(502);
});

test("preserves upstream unsupported media type errors", () => {
    expect(remapUpstreamStatus(415)).toBe(415);
});

test("maps upstream Cloudflare timeouts to bad gateway", () => {
    expect(remapUpstreamStatus(524)).toBe(502);
});
