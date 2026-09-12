export const deviceCodeMessages = {
    expired: "This code has expired. Get a new code from your device.",
    used: "This code has already been used. Return to your device, or get a new code to reconnect.",
    invalid: "Code not recognized. Check it and try again.",
    unavailable: "Couldn’t verify the code. Try again.",
};

export type DeviceCodeError = keyof typeof deviceCodeMessages;

export function normalizeDeviceCode(code: string): string {
    return code.replace(/[\s-]/g, "").toUpperCase();
}

export async function readDeviceRequest(
    response: Response,
): Promise<
    | { ok: true; scope: string; clientId: string | null }
    | { ok: false; error: DeviceCodeError }
> {
    const data = (await response.json().catch(() => null)) as {
        status?: string;
        error?: string;
        scope?: string;
        clientId?: string | null;
    } | null;
    if (!response.ok) {
        return {
            ok: false,
            error:
                data?.error === "expired_token"
                    ? "expired"
                    : response.status === 400
                      ? "invalid"
                      : "unavailable",
        };
    }
    if (data?.status === "approved" || data?.status === "denied")
        return { ok: false, error: "used" };
    if (data?.status === "expired") return { ok: false, error: "expired" };
    if (data?.status !== "pending") return { ok: false, error: "unavailable" };
    return {
        ok: true,
        scope: data.scope ?? "",
        clientId: data.clientId ?? null,
    };
}
