import type { PeriodSelection } from "@pollinations/ui";

export type DailyUsageRecord = {
    date: string;
    api_key_id: string;
    api_key: string | null;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
    input_text_tokens: number;
    input_cached_tokens: number;
    input_audio_tokens: number;
    input_audio_seconds: number;
    input_image_tokens: number;
    output_text_tokens: number;
    output_reasoning_tokens: number;
    output_audio_tokens: number;
    output_audio_seconds: number;
    output_image_tokens: number;
    output_video_seconds: number;
};

export type { PeriodGranularity } from "@pollinations/ui";

export type UsagePeriodSelection = PeriodSelection;

export type Metric = "requests" | "pollen";

export type FilterState = {
    period: UsagePeriodSelection;
    metric: Metric;
    selectedKeyIds: string[];
    selectedModels: string[];
};

export type ModelBreakdown = {
    model: string;
    label: string;
    requests: number;
    pollen: number;
    tierPollen?: number;
    paidPollen?: number;
    inputTextTokens?: number;
    inputCachedTokens?: number;
    inputAudioTokens?: number;
    inputAudioSeconds?: number;
    inputImageTokens?: number;
    outputTextTokens?: number;
    outputReasoningTokens?: number;
    outputAudioTokens?: number;
    outputAudioSeconds?: number;
    outputImageTokens?: number;
    outputVideoSeconds?: number;
};

export type DataPoint = {
    label: string;
    value: number;
    tierValue: number;
    paidValue: number;
    timestamp: Date;
    fullDate: string;
    modelBreakdown?: ModelBreakdown[];
};
