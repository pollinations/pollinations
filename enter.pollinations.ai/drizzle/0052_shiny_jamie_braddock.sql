ALTER TABLE `community_endpoint` ADD `type` text DEFAULT 'proxy' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `payload` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
-- Backfill. `type` says what a listing is; `payload` holds only what that kind
-- has. The columns the payload replaces stay in place: gen and enter deploy
-- separately, so a follow-up migration drops them once both read the payload.

-- A row naming an agent is one Enter runs. A row hand-granted delegation is an
-- agent on the owner's own server. Image rows are excluded on purpose: run
-- tokens are only minted on the text path, so the flag was inert there and
-- promoting it would start rejecting a live image endpoint.
UPDATE `community_endpoint` SET `type` = CASE
    WHEN `agent_id` IS NOT NULL THEN 'prompt_agent'
    WHEN `delegates_generation` = 1 AND `modality` = 'text' THEN 'hosted_agent'
    ELSE 'proxy'
END;--> statement-breakpoint

-- A prompt agent's payload is empty by construction: its target is the agent
-- runtime and its catalog fields come from the agent's base model.
UPDATE `community_endpoint` SET `payload` = '{}' WHERE `type` = 'prompt_agent';--> statement-breakpoint

UPDATE `community_endpoint`
SET `payload` = json_object('baseUrl', coalesce(`base_url`, ''))
WHERE `type` = 'hosted_agent';--> statement-breakpoint

UPDATE `community_endpoint`
SET `payload` = json_object(
    'baseUrl', coalesce(`base_url`, ''),
    'upstreamModel', `upstream_model`,
    'bearerTokenCiphertext', coalesce(`bearer_token_ciphertext`, ''),
    'modality', `modality`,
    'imagePricing', `image_pricing`,
    'inputModalities', CASE
        WHEN `input_modalities` IS NULL THEN json('null')
        ELSE json(`input_modalities`)
    END,
    'perUserRpm', `per_user_rpm`,
    'fallbackModelIds', CASE
        WHEN `fallback_model_ids` IS NULL THEN json('[]')
        ELSE json(`fallback_model_ids`)
    END,
    'prices', json_object(
        'promptTextPrice', `prompt_text_price`,
        'promptCachedPrice', `prompt_cached_price`,
        'promptCacheWritePrice', `prompt_cache_write_price`,
        'promptAudioPrice', `prompt_audio_price`,
        'promptImagePrice', `prompt_image_price`,
        'completionTextPrice', `completion_text_price`,
        'completionReasoningPrice', `completion_reasoning_price`,
        'completionAudioPrice', `completion_audio_price`,
        'completionImagePrice', `completion_image_price`
    )
)
WHERE `type` = 'proxy';
