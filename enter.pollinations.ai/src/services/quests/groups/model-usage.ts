import { getLogger } from "@logtape/logtape";
import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
    type RewardProposal,
} from "../types.ts";

const log = getLogger(["enter", "quests", "model-usage"]);

/**
 * Model-usage quests: one per modality (text / image / audio).
 * Completion comes from the quest_model_modalities Tinybird pipe, which returns
 * the current user's boolean flags per modality (a billed, successful
 * generation in that modality within the populated recent window). The pipe
 * decides whether the user qualifies; the rewards table is the idempotent write
 * path.
 */

const useTextModelQuest: QuestDefinition = {
    id: "use_text_model",
    title: "Use a text model",
    description:
        "Make one successful request from any of the [text](https://gen.pollinations.ai/docs#tag/text) models.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const useImageModelQuest: QuestDefinition = {
    id: "use_image_model",
    title: "Use an image model",
    description:
        "Make one successful request from any of the [image](https://gen.pollinations.ai/docs#tag/image) models.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const useAudioModelQuest: QuestDefinition = {
    id: "use_audio_model",
    title: "Use an audio model",
    description:
        "Make one successful request from any of the [audio](https://gen.pollinations.ai/docs#tag/audio) models.",
    category: "setup",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const QUESTS = [useTextModelQuest, useImageModelQuest, useAudioModelQuest];

// One row per user from quest_model_modalities.json. Flags are 0/1 (UInt8).
type ModalityRow = {
    userId: string;
    usedText: number;
    usedImage: number;
    usedAudio: number;
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposalsForUser(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const rows = await fetchTinybirdRows<ModalityRow>(
        tinybirdOrigin,
        "/v0/pipes/quest_model_modalities.json",
        tinybirdToken,
        { user_id: user.id },
    );

    // The pipe SHOULD already filter to this user, but the client-side filter is
    // the load-bearing guarantee (an un-redeployed/global pipe returns everyone).
    // Log the before/after-filter delta so "pipe returned N rows, 0 matched this
    // user" is obvious from the logs instead of looking like "no usage".
    const matched = rows.filter((entry) => entry.userId === user.id);
    log.info(
        "MODEL_USAGE_ROWS: userId={userId} pipeRows={pipeRows} matchedRows={matchedRows} flags={flags}",
        {
            userId: user.id,
            pipeRows: rows.length,
            matchedRows: matched.length,
            flags: matched.map((r) => ({
                userId: r.userId,
                usedText: r.usedText,
                usedImage: r.usedImage,
                usedAudio: r.usedAudio,
            })),
        },
    );

    const proposals: RewardProposal[] = [];
    for (const row of matched) {
        if (row.usedText) {
            proposals.push({ quest: useTextModelQuest, userId: row.userId });
        }
        if (row.usedImage) {
            proposals.push({ quest: useImageModelQuest, userId: row.userId });
        }
        if (row.usedAudio) {
            proposals.push({ quest: useAudioModelQuest, userId: row.userId });
        }
    }
    log.info(
        "MODEL_USAGE_PROPOSALS: userId={userId} count={count} questIds={questIds}",
        {
            userId: user.id,
            count: proposals.length,
            questIds: proposals.map((p) => p.quest.id),
        },
    );
    return proposals;
}
