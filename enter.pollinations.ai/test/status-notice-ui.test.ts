import { describe, expect, test, vi } from "vitest";
import {
    dismissStatusNotice,
    STATUS_NOTICE_DISMISS_KEY,
    shouldShowStatusNotice,
} from "../frontend/src/components/layout/status-notice-state.ts";
import type { StatusNotice } from "../src/routes/status-notice.ts";

const notice: StatusNotice = {
    message: "Maintenance in progress",
    linkUrl: null,
    linkLabel: null,
    updatedAt: "2026-07-25T12:00:00.000Z",
};

describe("status notice UI state", () => {
    test("shows an active notice and hides an inactive notice", () => {
        expect(shouldShowStatusNotice(notice, null)).toBe(true);
        expect(shouldShowStatusNotice(null, null)).toBe(false);
    });

    test("hides the dismissed notice but shows a later update", () => {
        expect(shouldShowStatusNotice(notice, notice.updatedAt)).toBe(false);
        expect(
            shouldShowStatusNotice(
                { ...notice, updatedAt: "2026-07-25T12:01:00.000Z" },
                notice.updatedAt,
            ),
        ).toBe(true);
    });

    test("stores the active notice identifier when dismissed", () => {
        const setItem = vi.fn();
        dismissStatusNotice({ setItem }, notice);
        expect(setItem).toHaveBeenCalledWith(
            STATUS_NOTICE_DISMISS_KEY,
            notice.updatedAt,
        );
    });
});
