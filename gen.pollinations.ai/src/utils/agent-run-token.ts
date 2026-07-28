import { jwtVerify, SignJWT } from "jose";

export const AGENT_RUN_TOKEN_PREFIX = "ag_";
export const AGENT_RUN_TOKEN_DEFAULT_TTL_SECONDS = 300;
export const AGENT_RUN_TOKEN_MAX_TTL_SECONDS = 900;

const AGENT_RUN_TOKEN_ISSUER = "gen.pollinations.ai";
const AGENT_RUN_TOKEN_AUDIENCE = "gen.pollinations.ai";
const MAX_CLOCK_SKEW_SECONDS = 5;
const MAX_SCOPED_MODELS = 64;

export type AgentRunClaims = {
    parentApiKeyId: string;
    agentId: string;
    runId: string;
    models: string[];
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
    agentId: string;
    runId: string;
    models: string[];
    expiresIn?: number;
    now?: number;
}): Promise<string> {
    const issuedAt = opts.now ?? Math.floor(Date.now() / 1000);
    const expiresIn = opts.expiresIn ?? AGENT_RUN_TOKEN_DEFAULT_TTL_SECONDS;
    if (expiresIn < 1 || expiresIn > AGENT_RUN_TOKEN_MAX_TTL_SECONDS) {
        throw new Error("Invalid agent run token lifetime");
    }

    const token = await new SignJWT({
        version: 1,
        agent: opts.agentId,
        models: opts.models,
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

    const models = Array.isArray(payload.models)
        ? payload.models.filter(
              (model): model is string =>
                  typeof model === "string" &&
                  model.length > 0 &&
                  model.length <= 253,
          )
        : [];
    if (
        payload.version !== 1 ||
        typeof payload.sub !== "string" ||
        !payload.sub ||
        typeof payload.jti !== "string" ||
        !payload.jti ||
        typeof payload.agent !== "string" ||
        !payload.agent ||
        payload.agent.length > 253 ||
        !Array.isArray(payload.models) ||
        models.length !== payload.models.length ||
        models.length < 1 ||
        models.length > MAX_SCOPED_MODELS ||
        new Set(models).size !== models.length ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        payload.iat > now + MAX_CLOCK_SKEW_SECONDS ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > AGENT_RUN_TOKEN_MAX_TTL_SECONDS
    ) {
        throw new Error("Invalid agent run token claims");
    }

    return {
        parentApiKeyId: payload.sub,
        agentId: payload.agent,
        runId: payload.jti,
        models,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
    };
}
