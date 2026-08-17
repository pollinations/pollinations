import { remapUpstreamStatus } from "@shared/error.ts";
import { expect, test } from "vitest";

test("maps upstream payment failures to bad gateway", () => {
    expect(remapUpstreamStatus(402)).toBe(502);
});
