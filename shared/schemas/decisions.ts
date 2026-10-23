import { z } from "zod";

/**
 * Decisions API schemas.
 *
 * OpenAI defines no typed-decision endpoint, so the wire contract follows the
 * published OpenRouter one (`openrouter.ai/api/alpha/decisions`, verified
 * against the live route on 2026-09-20): the request body is the provider's
 * native shape and the response returns `answers` plus token usage.
 */

/** The only decision model today; callers may omit `model` entirely. */
export const DEFAULT_DECISION_MODEL = "typesafe/jev-1.13";

/**
 * State, instructions, and criteria all accept any JSON the caller wants to
 * hand the model — a sentence, a record, or a list of records — so none of
 * them is narrowed to a string.
 */
const DecisionContentSchema = z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
]);

const ChoiceQuestionSchema = z.object({
    type: z.literal("choice"),
    instructions: DecisionContentSchema.meta({
        description: "What to decide.",
        example: "Which team should handle this?",
    }),
    criteria: z.record(z.string(), DecisionContentSchema.nullable()).meta({
        description:
            "Selectable options mapped to what each one means. The answer returns one of these keys.",
        example: {
            billing: "Payment issues",
            technical: "Product failures",
        },
    }),
});

const ScoreQuestionSchema = z.object({
    type: z.literal("score"),
    instructions: DecisionContentSchema.meta({
        description: "What to rate.",
        example: "How urgent is follow-up?",
    }),
    criteria: z
        .array(DecisionContentSchema)
        .min(2)
        .meta({
            description:
                "Ordered rungs from lowest to highest. The answer's score is a position on this scale, and its legend maps each index back to the rung.",
            example: ["none", "low", "medium", "high"],
        }),
});

const NoulQuestionSchema = z.object({
    type: z.literal("noul"),
    instructions: DecisionContentSchema.meta({
        description: "The yes/no proposition to evaluate.",
        example: "Does this convey urgency?",
    }),
    criteria: z
        .object({
            true: DecisionContentSchema.optional(),
            false: DecisionContentSchema.optional(),
        })
        .optional()
        .meta({
            description:
                "Optional descriptions of what true and false mean for this proposition.",
        }),
});

const DecisionQuestionSchema = z
    .discriminatedUnion("type", [
        ChoiceQuestionSchema,
        ScoreQuestionSchema,
        NoulQuestionSchema,
    ])
    .meta({
        description:
            "A `choice` between named options, a `score` on an ordered scale, or a `noul` probability for a yes/no proposition.",
    });

export const CreateDecisionRequestSchema = z.object({
    model: z.string().optional().meta({
        description:
            "Decision model to use. Defaults to `jev`. See the `/models` endpoint for models that list `/alpha/decisions` in `supported_endpoints`.",
        example: "jev",
    }),
    state: DecisionContentSchema.meta({
        description:
            "The facts to decide on. Confidence can stay high when facts are missing, so supply what is relevant rather than everything.",
        example: "My payouts have been failing for 3 days.",
    }),
    questions: z
        .record(z.string(), DecisionQuestionSchema)
        .refine((questions) => Object.keys(questions).length > 0, {
            message: "questions must contain at least one question",
        })
        .meta({
            description:
                "Questions to answer about the state, keyed by a name you choose. Each question is evaluated independently and answered under the same key.",
        }),
});

export type CreateDecisionRequest = z.infer<typeof CreateDecisionRequestSchema>;

const ChoiceAnswerSchema = z.object({
    type: z.literal("choice"),
    choice: z.string().meta({
        description: "The selected criteria key.",
    }),
    probabilities: z.record(z.string(), z.number()).meta({
        description: "Probability assigned to each option.",
    }),
    confidence: z.number(),
});

const ScoreAnswerSchema = z.object({
    type: z.literal("score"),
    score: z.number().meta({
        description:
            "Position on the criteria scale. Fractional: 2.72 sits between the rungs at index 2 and 3.",
    }),
    legend: z.record(z.string(), z.unknown()).meta({
        description:
            "Maps each scale index back to its criteria entry. Read it before interpreting the score.",
    }),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
});

const NoulAnswerSchema = z.object({
    type: z.literal("noul"),
    noul: z.number().meta({
        description: "Probability that the proposition is true, 0 to 1.",
    }),
});

/**
 * Response schemas document the API. The adapter forwards native answers
 * without parsing them, preserving any extra fields added by the provider.
 */
const DecisionAnswerSchema = z
    .union([ChoiceAnswerSchema, ScoreAnswerSchema, NoulAnswerSchema])
    .meta({
        description:
            "Answer for one question, matching the question's type. Score answers carry a legend; choice and score answers carry per-option probabilities and a confidence.",
    });

export const CreateDecisionResponseSchema = z.object({
    id: z.string(),
    model: z.string().meta({
        description: "The model that answered.",
    }),
    provider: z.string().meta({
        description: "Publisher of the model that answered.",
        example: "TypeSafe",
    }),
    answers: z.record(z.string(), DecisionAnswerSchema).meta({
        description: "One answer per question, under the same key.",
    }),
    usage: z
        .object({
            input_tokens: z.number(),
            output_tokens: z.number(),
        })
        .meta({
            description:
                "Token usage for the decision. Jev bills input tokens only.",
        }),
});

export type CreateDecisionResponse = z.infer<
    typeof CreateDecisionResponseSchema
>;
