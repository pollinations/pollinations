import type {
    LanguageModelCallOptions,
    ModelMessage,
    TextStreamPart,
    ToolLoopAgentSettings,
    ToolSet,
} from "ai";

export type ToolCallCounts = Record<string, number>;

export type AgentUsage = {
    inputTokens?: number;
    inputTokenDetails?: {
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    outputTokens?: number;
    outputTokenDetails?: {
        reasoningTokens?: number;
    };
    totalTokens?: number;
};

export type AgentOutput = {
    finishReason: string;
    usage: AgentUsage;
    toolCallCounts: ToolCallCounts;
};

export type AgentPart =
    | Extract<
          TextStreamPart<ToolSet>,
          { type: "tool-call" | "tool-result" | "tool-error" }
      >
    | { type: "text-delta"; text: string };

export type AgentGenerationSettings = Partial<
    Pick<
        LanguageModelCallOptions,
        | "frequencyPenalty"
        | "maxOutputTokens"
        | "presencePenalty"
        | "reasoning"
        | "temperature"
        | "topP"
    >
> & {
    providerOptions?: ToolLoopAgentSettings["providerOptions"];
    promptCacheBreakpoint?: boolean;
};

export type AgentRunner = (options: {
    messages: ModelMessage[];
    settings: AgentGenerationSettings;
    signal: AbortSignal;
    stream: boolean;
    onPart: (part: AgentPart) => void;
}) => Promise<AgentOutput>;
