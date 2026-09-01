const APPROACH_FIELDS = {
    re2: [],
    cot_reflection: [],
    bon: ["best_of_n"],
    mcts: ["mcts_simulations", "mcts_depth", "mcts_exploration"],
    rstar: ["rstar_max_depth", "rstar_num_rollouts", "rstar_c"],
};
const OPTILLM_FIELDS = new Set([
    "best_of_n",
    "n",
    ...Object.values(APPROACH_FIELDS).flat(),
]);
const FIELD_LIMITS = {
    best_of_n: [2, 5, true],
    mcts_simulations: [1, 4, true],
    mcts_depth: [1, 3, true],
    mcts_exploration: [0, 1, false],
    rstar_max_depth: [1, 4, true],
    rstar_num_rollouts: [1, 8, true],
    rstar_c: [0.1, 5, false],
};

function jsonError(status, message) {
    return Response.json({ error: { message } }, { status });
}

export function validateOptillmRequest(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Request body must be a JSON object";
    }
    const approach = body.optillm_approach;
    if (typeof approach !== "string" || !(approach in APPROACH_FIELDS)) {
        return "Unsupported OptiLLM approach";
    }
    const allowedFields = new Set(APPROACH_FIELDS[approach]);
    for (const field of OPTILLM_FIELDS) {
        if (field in body && !allowedFields.has(field)) {
            return `${field} is not valid for ${approach}`;
        }
        if (field in body && field in FIELD_LIMITS) {
            const [min, max, integer] = FIELD_LIMITS[field];
            const value = body[field];
            if (
                typeof value !== "number" ||
                !Number.isFinite(value) ||
                value < min ||
                value > max ||
                (integer && !Number.isInteger(value))
            ) {
                return `${field} is outside the supported range`;
            }
        }
    }
    if (Object.keys(body).some((field) => field.startsWith("cepo_"))) {
        return "CePO configuration is not supported";
    }
    return null;
}

export async function handleRequest(request, env, containerFor) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
        return containerFor(env.OPTILLM, "optillm").fetch(request);
    }
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
        return jsonError(404, "Not found");
    }
    if (!request.headers.get("authorization")?.startsWith("Bearer ag_")) {
        return jsonError(401, "A Pollinations agent run token is required");
    }

    let body;
    try {
        body = await request.clone().json();
    } catch {
        return jsonError(400, "Request body must be valid JSON");
    }
    const error = validateOptillmRequest(body);
    if (error) return jsonError(400, error);
    return containerFor(env.OPTILLM, "optillm").fetch(request);
}
