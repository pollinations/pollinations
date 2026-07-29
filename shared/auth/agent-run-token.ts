import { jwtVerify, SignJWT } from "jose";

export const AGENT_RUN_TOKEN_PREFIX = "ag_";
export const AGENT_RUN_TOKEN_TTL_SECONDS = 1800;

const AGENT_RUN_TOKEN_ISSUER = "gen.pollinations.ai";
const AGENT_RUN_TOKEN_AUDIENCE = "pollinations-api";
const MAX_CLOCK_SKEW_SECONDS = 5;
const MAX_SCOPED_MODELS = 64;

export type AgentRunClaims = {
    parentApiKeyId: string;
    agentId: string;
    runId: string;
    models?: string[];
    issuedAt: number;
    expiresAt: number;
};

function signingKey(secret: string): Uint8Array {
    return new TextEncoder().encode(
        `pollinations-agent-run-token:v1\0${secret}`,
    );
}

function isAgentRunToken(token: string): boolean {
    return token.startsWith(AGENT_RUN_TOKEN_PREFIX);
}

export async function signAgentRunToken(opts: {
    secret: string;
    parentApiKeyId: string;
    agentId: string;
    runId: string;
    models?: string[];
    expiresIn?: number;
    now?: number;
}): Promise<string> {
    const issuedAt = opts.now ?? Math.floor(Date.now() / 1000);
    const expiresIn = opts.expiresIn ?? AGENT_RUN_TOKEN_TTL_SECONDS;
    if (expiresIn < 1 || expiresIn > AGENT_RUN_TOKEN_TTL_SECONDS) {
        throw new Error("Invalid agent run token lifetime");
    }
    validateModels(opts.models);

    const token = await new SignJWT({
        version: 1,
        agent: opts.agentId,
        ...(opts.models && { models: opts.models }),
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
    if (!isAgentRunToken(token)) {
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

    const models = payload.models;
    if (
        payload.version !== 1 ||
        typeof payload.sub !== "string" ||
        !payload.sub ||
        typeof payload.jti !== "string" ||
        !payload.jti ||
        typeof payload.agent !== "string" ||
        !payload.agent ||
        payload.agent.length > 253 ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        payload.iat > now + MAX_CLOCK_SKEW_SECONDS ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > AGENT_RUN_TOKEN_TTL_SECONDS
    ) {
        throw new Error("Invalid agent run token claims");
    }
    validateModels(models);

    return {
        parentApiKeyId: payload.sub,
        agentId: payload.agent,
        runId: payload.jti,
        ...(models && { models }),
        issuedAt: payload.iat,
        expiresAt: payload.exp,
    };
}

export function intersectAgentRunModels(
    parentModels: string[] | undefined,
    tokenModels: string[] | undefined,
): string[] | undefined {
    if (!parentModels) return tokenModels;
    if (!tokenModels) return parentModels;
    return parentModels.filter((model) => tokenModels.includes(model));
}

function validateModels(value: unknown): asserts value is string[] | undefined {
    if (value === undefined) return;
    if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > MAX_SCOPED_MODELS ||
        value.some(
            (model) =>
                typeof model !== "string" ||
                model.length < 1 ||
                model.length > 253,
        ) ||
        new Set(value).size !== value.length
    ) {
        throw new Error("Invalid agent run token models");
    }
}
