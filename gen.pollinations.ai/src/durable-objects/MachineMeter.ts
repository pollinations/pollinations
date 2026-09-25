import { DurableObject } from "cloudflare:workers";
import { getLogger } from "@logtape/logtape";
import {
    type AuthenticatedApiKey,
    loadActiveApiKeyAuthResult,
} from "@shared/auth/api-key.ts";
import { getUserBalance, payerBucketToMeter } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { sendToTinybird } from "@shared/events.ts";
import type { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { drizzle } from "drizzle-orm/d1";
import type { GenerationAuthSnapshot } from "@/middleware/auth.ts";
import { requestIdentity } from "@/middleware/track.ts";

const SMOL_API = "https://api.smolmachines.com";
const HOUR_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const METER_KEY = "meter";
// smol states in which a machine holds its CPU and memory.
const RUNNING_STATES = new Set(["starting", "started", "running"]);

export type SmolMachine = {
    id: string;
    name: string;
    state: string;
    ready?: boolean;
    error?: string | null;
    source: { reference: string };
    resources: { cpus: number; memoryMb: number; diskGb: number };
    autoStopSeconds: number | null;
    createdAt: string;
};

type Payer = GenerationAuthSnapshot & {
    apiKey: NonNullable<GenerationAuthSnapshot["apiKey"]>;
};

type Refusal = PaymentRequiredError["errorCode"];

type Meter = {
    machineId: string;
    apiKeyId: string;
    price: number;
    // End of the last paid hour. The alarm fires here to bill the next one.
    paidUntil: number;
};

export function smol(
    env: CloudflareBindings,
    path: string,
    init?: RequestInit,
) {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${env.SMOL_API_KEY}`);
    return fetch(`${SMOL_API}${path}`, { ...init, headers });
}

/** Pollen per started hour, at smol's list rates (1 pollen ≈ $1). */
export function hourlyPrice(resources: SmolMachine["resources"]): number {
    return roundPollenLedgerAmount(
        0.04 +
            0.05 * resources.cpus +
            0.0162 * (resources.memoryMb / 1024) +
            0.0001 * resources.diskGb,
    );
}

export function hasMachinesScope(
    apiKey: Pick<AuthenticatedApiKey, "permissions"> | undefined,
): boolean {
    return apiKey?.permissions?.account?.includes("machines") ?? false;
}

async function refusalFor(
    env: CloudflareBindings,
    payer: Payer,
    price: number,
): Promise<Refusal | null> {
    const budget = payer.apiKey.pollenBalance;
    if (typeof budget === "number" && budget < price) {
        return "KEY_BUDGET_EXHAUSTED";
    }
    const balance = await getUserBalance(drizzle(env.DB), payer.user.id);
    return canCoverEstimatedCharge(balance, price)
        ? null
        : "INSUFFICIENT_BALANCE";
}

// The meter keeps no credential. It re-reads the key that last resumed the
// machine, so revoking that key, removing its machines scope or banning the
// account stops the machine at the next hour.
async function loadPayer(
    env: CloudflareBindings,
    apiKeyId: string,
): Promise<Payer | null> {
    const result = await loadActiveApiKeyAuthResult({
        apiKeyId,
        rawApiKey: "",
        env,
    }).catch(() => null);
    if (!result?.user || !hasMachinesScope(result.apiKey)) return null;
    const { rawKey: _rawKey, ...apiKey } = result.apiKey;
    return { user: { id: result.user.id, tier: result.user.tier }, apiKey };
}

/**
 * Bills one smol machine per started hour. A request that starts the machine
 * or runs a command pays the first hour; the alarm then bills each further
 * hour while smol reports the machine running, and stops it when the payer can
 * no longer cover the next one. The disk survives that stop.
 */
export class MachineMeter extends DurableObject<CloudflareBindings> {
    private readonly log = getLogger(["durable", "machine-meter"]);

    /** Charges an hour unless one is paid. Returns why it could not. */
    async resume(
        machineId: string,
        price: number,
        payer: Payer,
    ): Promise<Refusal | null> {
        return this.ctx.blockConcurrencyWhile(async () => {
            const meter = await this.ctx.storage.get<Meter>(METER_KEY);
            if (meter && meter.paidUntil > Date.now()) {
                // Whoever used the machine last pays its next hour.
                await this.ctx.storage.put(METER_KEY, {
                    ...meter,
                    apiKeyId: payer.apiKey.id,
                });
                return null;
            }
            return this.chargeHour(
                {
                    machineId,
                    apiKeyId: payer.apiKey.id,
                    price,
                    paidUntil: Date.now(),
                },
                payer,
            );
        });
    }

    async alarm(): Promise<void> {
        await this.ctx.blockConcurrencyWhile(async () => {
            const meter = await this.ctx.storage.get<Meter>(METER_KEY);
            if (!meter || meter.paidUntil > Date.now()) return;

            const response = await smol(
                this.env,
                `/v1/machines/${meter.machineId}`,
            );
            if (response.status === 404) {
                await this.ctx.storage.deleteAll();
                return;
            }
            if (!response.ok) {
                await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
                return;
            }
            const machine = await response.json<SmolMachine>();
            if (!RUNNING_STATES.has(machine.state)) {
                await this.ctx.storage.deleteAll();
                return;
            }

            const payer = await loadPayer(this.env, meter.apiKeyId);
            const refusal = payer
                ? await this.chargeHour(meter, payer)
                : "KEY_INACTIVE";
            if (!refusal) return;

            this.log.info("Stopping machine {machineId}: {refusal}", {
                machineId: meter.machineId,
                refusal,
            });
            const stopped = await smol(
                this.env,
                `/v1/machines/${meter.machineId}/stop`,
                { method: "POST" },
            );
            if (!stopped.ok) {
                await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
                return;
            }
            await this.ctx.storage.deleteAll();
        });
    }

    // Bills the hour that starts at `meter.paidUntil`.
    private async chargeHour(
        meter: Meter,
        payer: Payer,
    ): Promise<Refusal | null> {
        const refusal = await refusalFor(this.env, payer, meter.price);
        if (refusal) return refusal;

        const next = { ...meter, paidUntil: meter.paidUntil + HOUR_MS };
        // Claim the hour and schedule the next one before any money moves: a
        // crash from here on loses at most this hour's charge, and never
        // charges twice or drops the meter.
        await this.ctx.storage.transaction(async (txn) => {
            await txn.put(METER_KEY, next);
            await txn.setAlarm(next.paidUntil);
        });

        let deduction: Awaited<
            ReturnType<typeof handleBalanceDeduction>
        > | null = null;
        try {
            deduction = await handleBalanceDeduction({
                db: drizzle(this.env.DB) as unknown as Parameters<
                    typeof handleBalanceDeduction
                >[0]["db"],
                isBilledUsage: true,
                totalPrice: meter.price,
                userId: payer.user.id,
                apiKeyId: payer.apiKey.id,
                apiKeyPollenBalance: payer.apiKey.pollenBalance,
                // Nothing was reserved; refusalFor checked the key budget.
                apiKeyReservedAmount: 0,
                modelPaidOnly: false,
            });
        } catch (error) {
            this.log.error("Machine hour charge failed for {machineId}", {
                machineId: meter.machineId,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        await sendToTinybird(
            {
                id: crypto.randomUUID(),
                requestId: crypto.randomUUID(),
                requestPath: "/machines",
                startTime: new Date(meter.paidUntil),
                endTime: new Date(next.paidUntil),
                responseStatus: 200,
                environment: this.env.ENVIRONMENT,
                eventType: "machine.hour",
                ...requestIdentity(payer),
                ...(deduction?.payerBucket
                    ? payerBucketToMeter(deduction.payerBucket)
                    : {}),
                modelRequested: "machine",
                resolvedModelRequested: "machine",
                modelUsed: "machine",
                modelProviderUsed: "smol",
                isFinal: true,
                isBilledUsage: true,
                ...priceToEventParams(),
                ...usageToEventParams(),
                totalCost: meter.price,
                totalPrice: deduction?.billedPrice ?? 0,
            },
            this.env.TINYBIRD_INGEST_URL,
            this.env.TINYBIRD_INGEST_TOKEN,
            this.log,
        );
        return null;
    }
}
