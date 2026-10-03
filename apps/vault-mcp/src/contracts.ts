import { z } from "zod";

const id = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[\p{L}\p{N}_.:-]+$/u);
const version = z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1)
    .default(0);
export const graphWriteSchema = z
    .object({
        idempotencyKey: z.string().min(1).max(128),
        nodes: z
            .array(
                z
                    .object({
                        id,
                        name: z.string().min(1).max(256),
                        text: z.string().max(4096).default(""),
                        aliases: z
                            .array(z.string().min(1).max(128))
                            .max(16)
                            .default([]),
                        expectedVersion: version,
                    })
                    .strict(),
            )
            .max(32)
            .default([]),
        relations: z
            .array(
                z
                    .object({
                        id,
                        subject: id,
                        predicate: id,
                        target: id,
                        evidence: z.string().min(1).max(2048),
                        status: z
                            .enum(["active", "retracted"])
                            .default("active"),
                        expectedVersion: version,
                    })
                    .strict(),
            )
            .max(32)
            .default([]),
    })
    .strict()
    .refine((v) => v.nodes.length + v.relations.length > 0, "Empty write");
export const graphSearchSchema = z
    .object({
        query: z.string().max(512).default(""),
        queryVariants: z.array(z.string().min(1).max(128)).max(3).default([]),
        mode: z.enum(["find", "count"]).default("find"),
        subject: id.optional(),
        predicate: id.optional(),
        target: id.optional(),
        countUnit: z.enum(["relations", "targets"]).default("relations"),
        limit: z.number().int().min(1).max(32).default(10),
        cursor: z.string().max(1024).optional(),
    })
    .strict();
export const graphReadSchema = z
    .object({
        ids: z.array(id).min(1).max(16),
        includeHistory: z.boolean().default(false),
        expectedHead: z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER)
            .optional(),
    })
    .strict();
