-- Declare what Floret and Polli do through their public HTTP endpoints, so the
-- model catalog stops listing them with no capabilities (#15595).
-- Run after the endpoint_agent `capabilities` payload field is deployed to Gen
-- and Enter, because older readers reject the unknown key.
-- Only the two exact endpoint_agent listings change. Modalities, permissions,
-- routes and owners stay as they are, and running this again changes nothing.
--
-- Floret: web search, a sandboxed shell, and image, video, speech and
-- transcription through Pollinations models. Media still arrives as links in
-- the text response, so output_modalities stays text.
UPDATE community_endpoint
SET payload = json_set(
        payload,
        '$.capabilities',
        json('["web_search","code_execution","pollinations_models"]')
    ),
    updated_at = unixepoch()
WHERE id = 'e1363e66-54b8-49c3-a897-08d99629885f'
  AND name = 'floret'
  AND type = 'endpoint_agent'
  AND json_extract(payload, '$.capabilities') IS NULL;

-- Polli over HTTP: web search and caller-supplied tool calls. Discord-only
-- actions, GitHub mutations and visual rendering are not part of the API.
UPDATE community_endpoint
SET payload = json_set(
        payload,
        '$.capabilities',
        json('["tool_calling","web_search"]')
    ),
    updated_at = unixepoch()
WHERE id = '3ba66897-e040-41b5-8cf5-7c561ee5c52f'
  AND name = 'polli'
  AND type = 'endpoint_agent'
  AND json_extract(payload, '$.capabilities') IS NULL;
