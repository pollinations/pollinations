import { z } from "zod";
import type { AgentRunClaims } from "../auth/agent-run-token.ts";

export const BILLABLE_EVENT_BATCH_LIMIT = 50;

const CommunityRewardSchema = z
    .object({
        userId: z.string().min(1).max(128),
        rewardRate: z.number().finite().positive().max(1),
        basePrice: z.number().finite().nonnegative().optional(),
    })
    .strict();

export const BillingAuthorizationSchema = z
    .object({
        producer: z.string().min(1).max(64),
        requestId: z.string().min(1).max(128),
        estimatedPrice: z.number().finite().nonnegative(),
        paidOnly: z.boolean().default(false),
        model: z.string().min(1).max(128).optional(),
    })
    .strict();

export const BillableEventSchema = z
    .object({
        id: z.string().min(1).max(128),
        requestId: z.string().min(1).max(128),
        meter: z.string().min(1).max(128),
        price: z.number().finite().nonnegative(),
        paidOnly: z.boolean().default(false),
        occurredAt: z.number().int().nonnegative(),
        communityReward: CommunityRewardSchema.optional(),
        telemetry: z.record(z.string(), z.json()),
    })
    .strict();

export const BillableEventBatchSchema = z
    .array(BillableEventSchema)
    .min(1)
    .max(BILLABLE_EVENT_BATCH_LIMIT)
    .superRefine((events, ctx) => {
        const ids = new Set<string>();
        for (const [index, event] of events.entries()) {
            if (ids.has(event.id)) {
                ctx.addIssue({
                    code: "custom",
                    message: "Event ids must be unique within a batch",
                    path: [index, "id"],
                });
            }
            ids.add(event.id);
        }
    });

export type BillableEvent = z.infer<typeof BillableEventSchema>;
export type BillingAuthorization = z.infer<typeof BillingAuthorizationSchema>;

export type BillingIdentity = {
    userId: string;
    tier: string;
    agentRun?: AgentRunClaims;
    balances: {
        tier: number;
        pack: number;
        apiKey: number | null;
    };
    apiKey: {
        id: string;
        name: string | null;
        permissions: Record<string, string[]> | null;
        keyType: string | null;
        clientId: string | null;
        createdVia: string | null;
        clientName: string | null;
        clientUserId: string | null;
    };
};

export type BillingIntrospectionResponse =
    | { ok: true; identity: BillingIdentity }
    | { ok: false; error: "invalid_api_key" | "forbidden" };

export type BillingAuthorizationResponse =
    | {
          ok: true;
          identity: BillingIdentity;
          grant: {
              id: string;
              reservedPrice: number;
              expiresAt: number;
              duplicate: boolean;
          };
      }
    | {
          ok: false;
          error:
              | "invalid_authorization"
              | "invalid_api_key"
              | "forbidden"
              | "authorization_conflict"
              | "authorization_closed"
              | "insufficient_balance_or_budget"
              | "model_not_allowed";
      };

export type BillingEventResult =
    | {
          id: string;
          status: "settled" | "duplicate";
          billedPrice: number;
          payerBucket: "tier" | "pack" | null;
      }
    | {
          id: string;
          status: "rejected";
          reason: "authorization_unavailable";
      }
    | {
          id: string;
          status: "conflict";
          reason: "event_id_already_used";
      };

export type BillingSettlementResponse =
    | { ok: true; events: BillingEventResult[] }
    | {
          ok: false;
          error: "invalid_events";
      };

/**
 * Trusted internal service-binding contract. A holder may settle any grant id,
 * so bindings must only be exposed to Pollinations-operated workers.
 */
export interface BillingServiceBinding {
    introspect(apiToken: string): Promise<BillingIntrospectionResponse>;
    authorize(
        apiToken: string,
        input: BillingAuthorization,
    ): Promise<BillingAuthorizationResponse>;
    settle(
        authorizationId: string,
        events: BillableEvent[],
    ): Promise<BillingSettlementResponse>;
    cancel(authorizationId: string): Promise<{ cancelled: boolean }>;
}
