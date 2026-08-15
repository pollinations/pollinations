import { jwtVerify, SignJWT } from "jose";

export const AGENT_RUN_TOKEN_PREFIX = "ag_";
export const AGENT_RUN_TOKEN_TTL_SECONDS = 1800;

const AGENT_RUN_TOKEN_ISSUER = "gen.pollinations.ai";
const AGENT_RUN_TOKEN_AUDIENCE = "pollinations-api";
const MAX_CLOCK_SKEW_SECONDS = 5;

export type AgentRunClaims = {
    parentApiKeyId: string;
    runId: string;
    managedAgentId?: string;
    issuedAt: number;
    expiresAt: number;
};

function signingKey(secret: string): Uint8Array {
    return new TextEncoder().encode(
        `pollinations-agent-run-token:v1\0${secret}`,
    );
}

export async function signAgentRunToken(opts: {
    secret: string;
    parentApiKeyId: string;
    runId: string;
    managedAgentId?: string;
    expiresIn?: number;
    now?: number;
}): Promise<string> {
    const issuedAt = opts.now ?? Math.floor(Date.now() / 1000);
    const expiresIn = opts.expiresIn ?? AGENT_RUN_TOKEN_TTL_SECONDS;
    if (expiresIn < 1 || expiresIn > AGENT_RUN_TOKEN_TTL_SECONDS) {
        throw new Error("Invalid agent run token lifetime");
    }

    const token = await new SignJWT({
        version: 1,
        ...(opts.managedAgentId ? { managedAgentId: opts.managedAgentId } : {}),
    })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(AGENT_RUN_TOKEN_ISSUER)
        .setAudience(AGENT_RUN_TOKEN_AUDIENCE)
        .setSubject(opts.parentApiKeyId)
        .setJti(opts.runId)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + expiresIn)
        .sign(signingKey(opts.secret));

    return `${AGENT_RUN_TOKEN_PREFIX}${token}`;
}

export async function verifyAgentRunToken(
    token: string,
    secret: string,
    now = Math.floor(Date.now() / 1000),
): Promise<AgentRunClaims> {
    if (!token.startsWith(AGENT_RUN_TOKEN_PREFIX)) {
        throw new Error("Invalid agent run token prefix");
    }

    const { payload } = await jwtVerify(
        token.slice(AGENT_RUN_TOKEN_PREFIX.length),
        signingKey(secret),
        {
            algorithms: ["HS256"],
            issuer: AGENT_RUN_TOKEN_ISSUER,
            audience: AGENT_RUN_TOKEN_AUDIENCE,
            currentDate: new Date(now * 1000),
            clockTolerance: MAX_CLOCK_SKEW_SECONDS,
            typ: "JWT",
        },
    );

    // jwtVerify has already proven this token came from signAgentRunToken with
    // this secret, and checked issuer, audience and expiry. What is left is
    // shape: the JWT library types every claim as unknown.
    if (
        typeof payload.sub !== "string" ||
        !payload.sub ||
        typeof payload.jti !== "string" ||
        !payload.jti ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        (payload.managedAgentId !== undefined &&
            (typeof payload.managedAgentId !== "string" ||
                !payload.managedAgentId))
    ) {
        throw new Error("Invalid agent run token claims");
    }

    return {
        parentApiKeyId: payload.sub,
        runId: payload.jti,
        ...(typeof payload.managedAgentId === "string"
            ? { managedAgentId: payload.managedAgentId }
            : {}),
        issuedAt: payload.iat,
        expiresAt: payload.exp,
    };
}
