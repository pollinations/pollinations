export const CREDENTIAL_QUERY_PARAMS = new Set([
    "access_token",
    "api_key",
    "key",
    "token",
]);

export const REDACTED = "[redacted]";

export function redactQueryParam(
    key: string,
    value: string | string[],
): string | string[] {
    return CREDENTIAL_QUERY_PARAMS.has(key.toLowerCase()) ? REDACTED : value;
}

export function redactCredentialQueryParams(url: URL): string {
    const redacted = new URL(url);
    for (const param of redacted.searchParams.keys()) {
        if (CREDENTIAL_QUERY_PARAMS.has(param.toLowerCase())) {
            redacted.searchParams.set(param, REDACTED);
        }
    }
    return redacted.toString();
}
