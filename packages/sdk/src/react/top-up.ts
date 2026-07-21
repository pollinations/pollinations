export type TopUpStatus = "success" | "canceled";

export interface TopUpRequest {
    packKey?: "p2" | "p5" | "p10" | "p20" | "p50" | "p100";
    returnUrl?: string;
}

export interface TopUpReturnResult {
    cleanedUrl: string | null;
    status: TopUpStatus | null;
    invalidState: boolean;
}

interface ReadOnlyLocation {
    href: string;
}

interface TopUpStorage {
    getItem(key: string): string | null;
    removeItem(key: string): void;
}

export function canonicalizeTopUpReturnUrl(value: string): string {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.delete("topup");
    url.searchParams.delete("topup_state");
    return url.toString();
}

export function consumeTopUpReturn(
    location: ReadOnlyLocation,
    storage: TopUpStorage,
    stateStorageKey: string,
): TopUpReturnResult {
    const url = new URL(location.href);
    const rawStatus = url.searchParams.get("topup");
    const receivedState = url.searchParams.get("topup_state");

    if (rawStatus === null && receivedState === null) {
        return { cleanedUrl: null, status: null, invalidState: false };
    }

    url.searchParams.delete("topup");
    url.searchParams.delete("topup_state");
    const cleanedUrl = `${url.pathname}${url.search}${url.hash}`;
    const status =
        rawStatus === "success" || rawStatus === "canceled" ? rawStatus : null;
    const expectedState = storage.getItem(stateStorageKey);

    if (!status || !expectedState || receivedState !== expectedState) {
        return { cleanedUrl, status: null, invalidState: true };
    }

    storage.removeItem(stateStorageKey);
    return { cleanedUrl, status, invalidState: false };
}
