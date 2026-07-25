import type { StatusNotice } from "../../backend-types.ts";

export const STATUS_NOTICE_DISMISS_KEY = "polli:status-notice:dismissed";

export function dismissedNoticeUpdatedAt(
    storage: Pick<Storage, "getItem">,
): string | null {
    try {
        return storage.getItem(STATUS_NOTICE_DISMISS_KEY);
    } catch {
        return null;
    }
}

export function shouldShowStatusNotice(
    notice: StatusNotice | null,
    dismissedUpdatedAt: string | null,
): notice is StatusNotice {
    return Boolean(notice && notice.updatedAt !== dismissedUpdatedAt);
}

export function dismissStatusNotice(
    storage: Pick<Storage, "setItem">,
    notice: StatusNotice,
): void {
    try {
        storage.setItem(STATUS_NOTICE_DISMISS_KEY, notice.updatedAt);
    } catch {
        return;
    }
}
