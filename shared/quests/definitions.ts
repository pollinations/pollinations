import type { Bucket } from "../billing/deduction.ts";

export type QuestCategory =
    | "onboarding"
    | "spend"
    | "build"
    | "grow"
    | "engage";
export type QuestStatus = "active" | "planned";
export type QuestTrigger =
    | "api_key_created"
    | "first_top_up"
    | "first_chat_completion"
    | "first_image_generation";

export type QuestDefinition = {
    id: string;
    title: string;
    description: string;
    category: QuestCategory;
    status: QuestStatus;
    trigger: QuestTrigger;
    rewardAmount: number;
    balanceBucket: Bucket;
    repeatability: "once";
};

export const QUEST_DEFINITIONS: QuestDefinition[] = [
    {
        id: "onboarding:first_api_key",
        title: "Create your first API key",
        description: "Create a Pollinations API key from your account.",
        category: "onboarding",
        status: "active",
        trigger: "api_key_created",
        rewardAmount: 0.5,
        balanceBucket: "pack",
        repeatability: "once",
    },
    {
        id: "spend:first_top_up",
        title: "Make your first top-up",
        description: "Buy your first Pollen pack.",
        category: "spend",
        status: "active",
        trigger: "first_top_up",
        rewardAmount: 2,
        balanceBucket: "pack",
        repeatability: "once",
    },
    {
        id: "onboarding:first_chat_completion",
        title: "Run your first chat completion",
        description: "Send a successful chat completion request.",
        category: "onboarding",
        status: "planned",
        trigger: "first_chat_completion",
        rewardAmount: 0.5,
        balanceBucket: "pack",
        repeatability: "once",
    },
    {
        id: "onboarding:first_image_generation",
        title: "Generate your first image",
        description: "Send a successful image generation request.",
        category: "onboarding",
        status: "planned",
        trigger: "first_image_generation",
        rewardAmount: 0.5,
        balanceBucket: "pack",
        repeatability: "once",
    },
];

export function getQuestDefinition(id: string): QuestDefinition | undefined {
    return QUEST_DEFINITIONS.find((quest) => quest.id === id);
}

export function activeQuestDefinitions(): QuestDefinition[] {
    return QUEST_DEFINITIONS.filter((quest) => quest.status === "active");
}
