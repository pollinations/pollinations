import { HTTPException } from "hono/http-exception";

export const ACCOUNT_USAGE_PERMISSION_DESCRIPTION =
    "Permission denied - API key missing `account:usage` permission";
export const ACCOUNT_USAGE_PERMISSION_MESSAGE =
    "API key does not have 'account:usage' permission";

export function requireAccountUsagePermission(apiKey?: {
    permissions?: Record<string, string[]>;
}): void {
    if (apiKey && !apiKey.permissions?.account?.includes("usage")) {
        throw new HTTPException(403, {
            message: ACCOUNT_USAGE_PERMISSION_MESSAGE,
        });
    }
}
