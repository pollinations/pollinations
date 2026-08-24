// In-process stand-in for enter's ServiceGateway RPC entrypoint. Runs as an
// auxiliary miniflare worker named "pollinations-enter" so the media worker's
// ENTER service binding (entrypoint = "ServiceGateway") resolves in tests.
// The real gateway lives in enter.pollinations.ai/src/service-gateway.ts and
// is covered by enter's own test suite; this stub only speaks the wire
// contract in shared/schemas/service-billing.ts.
import { WorkerEntrypoint } from "cloudflare:workers";

const IDENTITIES = {
    pk_alice: {
        user: { id: "user_alice", tier: "seed" },
        apiKey: {
            id: "key_alice",
            name: "alice-key",
            metadata: { keyType: "publishable" },
            byopClientKeyId: "pk_app_1",
        },
    },
    pk_bob: {
        user: { id: "user_bob", tier: "seed" },
        apiKey: {
            id: "key_bob",
            name: "bob-key",
            metadata: { keyType: "publishable" },
            byopClientKeyId: null,
        },
    },
    sk_alice: {
        user: { id: "user_alice", tier: "seed" },
        apiKey: {
            id: "key_alice_secret",
            name: "alice-secret",
            metadata: { keyType: "secret" },
            byopClientKeyId: null,
        },
    },
    sk_bob: {
        user: { id: "user_bob", tier: "seed" },
        apiKey: {
            id: "key_bob_secret",
            name: "bob-secret",
            metadata: { keyType: "secret" },
            byopClientKeyId: null,
        },
    },
    // A key created before typed key metadata existed: no keyType. Media must
    // treat it as a secret key, matching /account/key's `|| "secret"`.
    sk_alice_legacy: {
        user: { id: "user_alice", tier: "seed" },
        apiKey: {
            id: "key_alice_legacy",
            name: "legacy-key",
            byopClientKeyId: null,
        },
    },
};

// Tokens enter refuses with a denial rather than treating as unknown.
const DENIALS = {
    pk_banned: { status: 403, message: "Account banned" },
    pk_broke: { status: 402, message: "Insufficient balance." },
};

const INVALID_KEY_DENIAL = {
    status: 401,
    message: "A valid API key is required.",
};

let calls = { authorize: [], settle: [] };
let authorizationCount = 0;

function resolve(token) {
    const denial = DENIALS[token];
    if (denial) return { denial };
    const identity = IDENTITIES[token];
    if (!identity) return { denial: INVALID_KEY_DENIAL };
    return { identity };
}

export class ServiceGateway extends WorkerEntrypoint {
    introspect(token) {
        const { identity, denial } = resolve(token);
        if (!identity) return { valid: false, denial };
        return { valid: true, ...identity };
    }

    authorize(input) {
        calls.authorize.push(input);
        const { identity, denial } = resolve(input.token);
        if (!identity) return { ok: false, denial };
        authorizationCount += 1;
        return {
            ok: true,
            authorizationId: `auth_${authorizationCount}`,
            ...identity,
        };
    }

    settle(input) {
        calls.settle.push(input);
        return {
            ok: true,
            settled: input.events.map((event) => event.eventId),
            duplicates: [],
        };
    }

    // Test hooks (not part of the ServiceGatewayBinding contract).
    recordedCalls() {
        return calls;
    }

    resetCalls() {
        calls = { authorize: [], settle: [] };
    }
}

export default {
    fetch() {
        return new Response(null, { status: 404 });
    },
};
