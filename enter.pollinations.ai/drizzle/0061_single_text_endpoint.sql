-- Text listings select one exact upstream endpoint. Existing Responses targets
-- already served both public APIs, so retain them in preference to Chat.
WITH targets AS (
    SELECT id, base_url, payload, pending_payload,
        json_extract(payload, '$.responsesUrl') AS responses_url,
        CASE WHEN instr(base_url, '?') > 0
            THEN substr(base_url, 1, instr(base_url, '?') - 1)
            ELSE base_url END AS path,
        CASE WHEN instr(base_url, '?') > 0
            THEN substr(base_url, instr(base_url, '?'))
            ELSE '' END AS query
    FROM community_endpoint
    WHERE (type = 'endpoint_agent' OR
        (type = 'proxy' AND json_extract(payload, '$.modality') = 'text'))
        AND json_type(payload, '$.api') IS NULL
), suffixes(suffix) AS (
    VALUES ('/chat/completions'), ('/responses'), ('/images/generations'),
        ('/images/edits'), ('/audio/transcriptions'), ('/audio/speech'), ('/embeddings')
), normalized AS (
    SELECT *, CASE
        WHEN responses_url IS NOT NULL THEN 'responses'
        ELSE 'chat_completions' END AS api,
        rtrim(path, '/') AS trimmed_path
    FROM targets
), migrated AS (
    SELECT *, CASE
        WHEN responses_url IS NOT NULL THEN responses_url
        WHEN substr(trimmed_path, -length('/chat/completions')) = '/chat/completions' THEN base_url
        ELSE coalesce((
            SELECT substr(trimmed_path, 1, length(trimmed_path) - length(suffix))
            FROM suffixes WHERE substr(trimmed_path, -length(suffix)) = suffix
        ), trimmed_path) || '/chat/completions' || query END AS url
    FROM normalized
)
UPDATE community_endpoint AS endpoint
SET base_url = migrated.url,
    payload = json_set(json_remove(migrated.payload, '$.responsesUrl'), '$.api', migrated.api),
    -- Pending payloads delay prices only; the currently selected endpoint is
    -- immediate and must not be replaced by stale queued endpoint settings.
    pending_payload = CASE WHEN migrated.pending_payload IS NULL THEN NULL ELSE
        json_set(json_remove(migrated.pending_payload, '$.responsesUrl'), '$.api', migrated.api) END
FROM migrated WHERE endpoint.id = migrated.id;
