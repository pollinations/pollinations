import { z } from "zod";

export const BILLABLE_EVENT_BATCH_LIMIT = 50;

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
