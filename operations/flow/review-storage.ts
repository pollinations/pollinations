// The SDK owns storage. Restart clears only this example's tab-scoped session.
export function clearExampleStorage(appKey: string) {
    const prefix = `polli:${appKey}:`;
    for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(prefix)) sessionStorage.removeItem(key);
    }
}
