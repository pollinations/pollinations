import { describe, expect, it } from "vitest";
import { discordDisconnectMessage } from "../frontend/src/components/account/discord-connection.ts";

describe("discordDisconnectMessage", () => {
    it("explains that a fresh sign-in is required", () => {
        expect(
            discordDisconnectMessage({
                code: "SESSION_NOT_FRESH",
                message: "Session is not fresh",
            }),
        ).toBe("For security, sign out and back in, then disconnect Discord.");
    });

    it("explains that the last account cannot be unlinked", () => {
        expect(
            discordDisconnectMessage({
                code: "FAILED_TO_UNLINK_LAST_ACCOUNT",
            }),
        ).toBe("Connect another sign-in method before disconnecting Discord.");
    });

    it("uses a server message for other failures", () => {
        expect(
            discordDisconnectMessage({
                code: "ACCOUNT_NOT_FOUND",
                message: "Account not found",
            }),
        ).toBe("Account not found");
    });

    it("falls back to a generic message", () => {
        expect(discordDisconnectMessage(undefined)).toBe(
            "Could not disconnect Discord.",
        );
        expect(discordDisconnectMessage({})).toBe(
            "Could not disconnect Discord.",
        );
    });
});
