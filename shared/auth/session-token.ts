import { jwtVerify, SignJWT } from "jose";

// A short-lived bearer credential the Enter dashboard mints from its session
// cookie, so the dashboard calls the public API like any other client instead
// of keeping cookie-only copies of the same routes. It acts as the account
// owner with no key restrictions. It is not tied to the cookie session:
// signing out leaves it valid until it expires.
export const SESSION_TOKEN_PREFIX = "sess_";
export const SESSION_TOKEN_TTL_SECONDS = 900;

const SESSION_TOKEN_ISSUER = "enter.pollinations.ai";
const SESSION_TOKEN_AUDIENCE = "pollinations-api";
const MAX_CLOCK_SKEW_SECONDS = 5;

function signingKey(secret: string) {
    return new TextEncoder().encode(`pollinations-session-token:v1\0${secret}`);
}

export async function signSessionToken(opts: {
    secret: string;
    userId: string;
    now?: number;
}): Promise<string> {
    const issuedAt = opts.now ?? Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(SESSION_TOKEN_ISSUER)
        .setAudience(SESSION_TOKEN_AUDIENCE)
        .setSubject(opts.userId)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + SESSION_TOKEN_TTL_SECONDS)
        .sign(signingKey(opts.secret));
    return `${SESSION_TOKEN_PREFIX}${token}`;
}

/**
 * Returns the user id a `sess_` token was minted for. Throws if it is
 * invalid. Callers check the prefix.
 */
export async function verifySessionToken(
    token: string,
    secret: string,
): Promise<string> {
    const { payload } = await jwtVerify(
        token.slice(SESSION_TOKEN_PREFIX.length),
        signingKey(secret),
        {
            algorithms: ["HS256"],
            issuer: SESSION_TOKEN_ISSUER,
            audience: SESSION_TOKEN_AUDIENCE,
            clockTolerance: MAX_CLOCK_SKEW_SECONDS,
            typ: "JWT",
            requiredClaims: ["exp", "sub"],
        },
    );
    if (typeof payload.sub !== "string" || !payload.sub) {
        throw new Error("Invalid session token subject");
    }
    return payload.sub;
}
