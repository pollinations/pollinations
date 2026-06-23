import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * Model-usage quests: one per modality (text / image / audio). Completion comes
 * from the quest_model_modalities Tinybird pipe, which returns one row per user
 * with a boolean flag per modality (a billed, successful generation in that
 * modality, lifetime). The pipe decides who qualifies; recordReward is the
 * idempotent write path.
 */

const MAX_REWARDS_PER_RUN = 1000;

const useTextModelQuest: QuestDefinition = {
    id: "grow:use_text_model",
    title: "Generate with a text model",
    description: "Make your first request to a text model.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const useImageModelQuest: QuestDefinition = {
    id: "grow:use_image_model",
    title: "Generate with an image model",
    description: "Make your first request to an image model.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 0.25,
    balanceBucket: "tier",
};

const useAudioModelQuest: QuestDefinition = {
    id: "grow:use_audio_model",
    title: "Generate with an audio model",
    description: "Make your first request to an audio model.",
    category: "grow",
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

export async function findRewardProposals({
    env,
}: QuestEvaluationContext): Promise<RewardProposal[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const rows = await fetchTinybirdRows<ModalityRow>(
        tinybirdOrigin,
        "/v0/pipes/quest_model_modalities.json",
        tinybirdToken,
        {},
    );

    const proposals: RewardProposal[] = [];
    for (const row of rows.slice(0, MAX_REWARDS_PER_RUN)) {
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
    return proposals;
}
