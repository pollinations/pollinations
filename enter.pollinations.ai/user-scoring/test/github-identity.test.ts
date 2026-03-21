import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeD1 } = vi.hoisted(() => ({
    executeD1: vi.fn(() => true),
}));

vi.mock("../shared/d1.ts", () => ({
    executeD1,
}));

import {
    banUsersByEmails,
    GITHUB_ACCOUNT_DELETED_REASON,
    GITHUB_ID_INVALID_REASON,
} from "../shared/github-identity.ts";

beforeEach(() => {
    executeD1.mockClear();
});

describe("banUsersByEmails", () => {
    it("defaults to the deleted-account ban reason", () => {
        banUsersByEmails("staging", ["deleted@example.com"]);

        expect(executeD1).toHaveBeenCalledOnce();
        expect(executeD1.mock.calls[0][1]).toContain(
            `ban_reason = '${GITHUB_ACCOUNT_DELETED_REASON}'`,
        );
    });

    it("allows callers to set an explicit invalid-id ban reason", () => {
        banUsersByEmails(
            "staging",
            ["invalid@example.com"],
            GITHUB_ID_INVALID_REASON,
        );

        expect(executeD1).toHaveBeenCalledOnce();
        expect(executeD1.mock.calls[0][1]).toContain(
            `ban_reason = '${GITHUB_ID_INVALID_REASON}'`,
        );
    });
});
