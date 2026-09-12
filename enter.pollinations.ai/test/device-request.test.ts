import { describe, expect, it } from "vitest";
import {
    normalizeDeviceCode,
    readDeviceRequest,
} from "../frontend/src/lib/device-request.ts";

describe("device code verification", () => {
    it.each([
        "ABCDEFGH",
        "abcd-efgh",
        "  abcd efgh  ",
    ])("accepts formatting in %s and sends the server's eight-character code", (code) =>
        expect(normalizeDeviceCode(code)).toBe("ABCDEFGH"));

    it("does not silently discard other invalid characters", () => {
        expect(normalizeDeviceCode("abcd/efgh")).toBe("ABCD/EFGH");
    });

    it("reads app identity and scopes from the pending server request", async () => {
        expect(
            await readDeviceRequest(
                Response.json({
                    status: "pending",
                    scope: "profile usage",
                    clientId: "preview-client",
                }),
            ),
        ).toEqual({
            ok: true,
            scope: "profile usage",
            clientId: "preview-client",
        });
    });

    it("also accepts a generic device without a registered app", async () => {
        expect(
            await readDeviceRequest(
                Response.json({ status: "pending", scope: "", clientId: null }),
            ),
        ).toEqual({ ok: true, scope: "", clientId: null });
    });

    it.each([
        "approved",
        "denied",
    ])("rejects an already %s request", async (status) => {
        expect(await readDeviceRequest(Response.json({ status }))).toEqual({
            ok: false,
            error: "used",
        });
    });

    it.each([
        [400, { error: "expired_token" }, "expired"],
        [400, { error: "invalid_code" }, "invalid"],
        [503, { message: "Unavailable" }, "unavailable"],
        [200, { status: "unexpected" }, "unavailable"],
    ])("handles HTTP %s with %j", async (status, body, error) => {
        expect(
            await readDeviceRequest(Response.json(body, { status })),
        ).toEqual({ ok: false, error });
    });

    it("treats an unreadable success response as unavailable, not approved", async () => {
        expect(await readDeviceRequest(new Response("invalid JSON"))).toEqual({
            ok: false,
            error: "unavailable",
        });
    });
});
