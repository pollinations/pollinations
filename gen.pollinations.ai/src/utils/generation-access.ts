import { createBalanceCheckResult } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import {
    calculatePrice,
    getModelDefinition,
    getPriceDefinition,
    type ModelName,
    type Usage,
} from "@shared/registry/registry.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { IMAGE_CONFIG } from "@/image/models.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { getEstimatedPrice, getModelStats } from "@/utils/model-stats.ts";

type GenerationAccessVariables = AuthVariables &
    BalanceVariables &
    ModelVariables &
    LoggerVariables;

type GenerationAccessEnv = {
    Bindings: CloudflareBindings;
    Variables: GenerationAccessVariables;
};

type BalanceCheckOptions = {
    minimumEstimatedPrice?: number;
};

type DurationModelConfig = {
    isVideo?: boolean;
    defaultDuration?: number;
    maxDuration?: number;
};

function parseDuration(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function getValidatedRequestDuration(c: {
    req: { valid: (target: never) => unknown };
}): unknown {
    for (const target of ["query", "json"] as const) {
        try {
            const data = c.req.valid(target as never) as
                | { duration?: unknown }
                | undefined;
            if (data?.duration !== undefined) return data.duration;
        } catch {
            // Some routes have no validator for this target.
        }
    }
    return undefined;
}

function getVideoDurationEstimate(
    model: ModelName,
    duration: number | undefined,
): number | undefined {
    const config = IMAGE_CONFIG[model as keyof typeof IMAGE_CONFIG] as
        | DurationModelConfig
        | undefined;
    if (!config?.isVideo) return undefined;

    const requestedDuration = duration ?? config.defaultDuration;
    if (!requestedDuration) return undefined;

    const clamped = Math.min(
        config.maxDuration ?? requestedDuration,
        Math.max(1, requestedDuration),
    );
    if (model === "nova-reel") {
        return Math.min(120, Math.max(6, Math.ceil(clamped / 6) * 6));
    }
    return clamped;
}

export function getDurationBasedEstimatedPrice(
    model: ModelName,
    rawDuration: unknown,
): number {
    const priceDefinition = getPriceDefinition(model);
    if (!priceDefinition) return 0;

    const requestedDuration = parseDuration(rawDuration);
    const seconds =
        getVideoDurationEstimate(model, requestedDuration) ?? requestedDuration;
    if (!seconds || seconds <= 0) return 0;

    const usage: Usage = {};
    if (priceDefinition.completionVideoSeconds !== undefined) {
        usage.completionVideoSeconds = seconds;
    }
    if (priceDefinition.completionAudioSeconds !== undefined) {
        usage.completionAudioSeconds = seconds;
    }
    if (Object.keys(usage).length === 0) return 0;

    return calculatePrice(model, usage).totalPrice;
}

export async function checkBalance(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
    options: BalanceCheckOptions = {},
): Promise<void> {
    const { auth, balance, model, log } = vars;
    if (!auth.user?.id) return;

    const serviceDefinition = getModelDefinition(model.resolved);
    const isPaidOnly = serviceDefinition.paidOnly ?? false;

    const stats = await getModelStats(env.KV, log);
    const estimatedCost = getEstimatedPrice(stats, model.resolved);

    const apiKeyBudget = auth.apiKey?.pollenBalance;
    const requiredBudget = Math.max(
        0,
        estimatedCost,
        options.minimumEstimatedPrice ?? 0,
    );
    if (typeof apiKeyBudget === "number" && apiKeyBudget <= requiredBudget) {
        throw new HTTPException(402, {
            message: `API key budget too low. This request costs ~${requiredBudget.toFixed(4)} pollen, but this key has ${Math.max(0, apiKeyBudget).toFixed(4)}.`,
        });
    }

    const userBalance = await balance.getBalance(auth.user.id);

    if (!canCoverEstimatedCharge(userBalance, requiredBudget, isPaidOnly)) {
        const available = isPaidOnly
            ? userBalance.packBalance
            : Math.max(userBalance.tierBalance, userBalance.packBalance);
        throw new HTTPException(402, {
            message: `Insufficient balance. This request costs ~${requiredBudget.toFixed(4)} pollen, but your available balance is ${Math.max(0, available).toFixed(4)}.`,
        });
    }

    balance.balanceCheckResult = createBalanceCheckResult(
        userBalance,
        isPaidOnly,
    );
}

export async function requireGenerationAccess(
    vars: GenerationAccessVariables,
    env: CloudflareBindings,
    options: BalanceCheckOptions = {},
): Promise<void> {
    await vars.auth.requireAuthorization();
    vars.auth.requireModelAccess();
    await checkBalance(vars, env, options);
}

export const generationAccess = createMiddleware<GenerationAccessEnv>(
    async (c, next) => {
        const duration = getValidatedRequestDuration(c);
        await requireGenerationAccess(c.var, c.env, {
            minimumEstimatedPrice: getDurationBasedEstimatedPrice(
                c.var.model.resolved,
                duration,
            ),
        });
        await next();
    },
);
