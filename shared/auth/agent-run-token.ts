import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const AGENT_RUN_TOKEN_PREFIX = "ag_";
export const AGENT_RUN_TOKEN_TTL_SECONDS = 1800;

const AGENT_RUN_TOKEN_ISSUER = "gen.pollinations.ai";
const AGENT_RUN_TOKEN_AUDIENCE = "pollinations-api";
const MAX_CLOCK_SKEW_SECONDS = 5;

export type AgentRunClaims = {
    parentApiKeyId: string;
    // The request_id of the call that minted this token, so its generations can
    // be grouped. The agent's steps arrive as separate requests, each minting
    // its own id, and this token is the only thing that crosses that hop. Keep
    // it in the signature: the agent holds the token, so a header carrying the
    // same id would be a value the agent gets to choose.
    parentRequestId: string;
    managedAgentId?: string;
    // The community model id of the agent the token was minted for, so a
    // refusal during the run can name the agent that asked.
    agentModelId?: string;
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
    parentRequestId: string;
    managedAgentId?: string;
    agentModelId?: string;
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
        parentRequestId: opts.parentRequestId,
        ...(opts.managedAgentId ? { managedAgentId: opts.managedAgentId } : {}),
        ...(opts.agentModelId ? { agentModelId: opts.agentModelId } : {}),
    })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(AGENT_RUN_TOKEN_ISSUER)
        .setAudience(AGENT_RUN_TOKEN_AUDIENCE)
        .setSubject(opts.parentApiKeyId)
        .setJti(crypto.randomUUID())
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
        typeof payload.parentRequestId !== "string" ||
        !payload.parentRequestId ||
        (payload.managedAgentId !== undefined &&
            (typeof payload.managedAgentId !== "string" ||
                !payload.managedAgentId)) ||
        (payload.agentModelId !== undefined &&
            (typeof payload.agentModelId !== "string" || !payload.agentModelId))
    ) {
        throw new Error("Invalid agent run token claims");
    }

    return {
        parentApiKeyId: payload.sub,
        parentRequestId: payload.parentRequestId,
        ...(typeof payload.managedAgentId === "string"
            ? { managedAgentId: payload.managedAgentId }
            : {}),
        ...(typeof payload.agentModelId === "string"
            ? { agentModelId: payload.agentModelId }
            : {}),
        issuedAt: payload.iat,
        expiresAt: payload.exp,
    };
}

export type Grant = { model: string } | { permission: string };

/**
 * Signs that a run of this agent was refused this grant on this key. The grant
 * link reaches the owner through the agent, so an unsigned name would let one
 * agent pose as another. Binding the key and the grant stops a signed name
 * from being moved onto a different request.
 */
export function signGrantAgent(opts: {
    secret: string;
    apiKeyId: string;
    grant: Grant;
    agent: string;
}): string {
    const entry =
        "model" in opts.grant
            ? `model:${opts.grant.model}`
            : `permission:${opts.grant.permission}`;
    return createHmac("sha256", `pollinations-grant-agent:v1\0${opts.secret}`)
        .update([opts.apiKeyId, entry, opts.agent].join("\0"))
        .digest("base64url");
}

export function verifyGrantAgent(
    opts: Parameters<typeof signGrantAgent>[0] & { sig: string },
): boolean {
    const expected = Buffer.from(signGrantAgent(opts));
    const actual = Buffer.from(opts.sig);
    return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
    );
}
