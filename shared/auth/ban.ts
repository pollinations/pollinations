export const ACCOUNT_RESTRICTED_MESSAGE =
    "Account restricted. Contact billing@pollinations.ai";

export function isUserBanned(user: {
    banned?: boolean | null;
    banExpires?: Date | string | null;
}): boolean {
    return (
        user.banned === true &&
        (!user.banExpires || !(new Date(user.banExpires) <= new Date()))
    );
}

export function isBannedLoginError(error: string): boolean {
    return error === "BANNED_USER" || error === "banned";
}
