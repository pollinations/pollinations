-- Existing external text listings use Chat Completions. Backfill their API
-- and exact URL; managed prompt agents and media listings are unchanged.
WITH targets AS (
    SELECT id, base_url, payload, pending_payload,
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
    SELECT *, rtrim(path, '/') AS trimmed_path
    FROM targets
), migrated AS (
    SELECT *, coalesce((
            SELECT substr(trimmed_path, 1, length(trimmed_path) - length(suffix))
            FROM suffixes WHERE substr(trimmed_path, -length(suffix)) = suffix
        ), trimmed_path) || '/chat/completions' || query AS url
    FROM normalized
)
UPDATE community_endpoint AS endpoint
SET base_url = migrated.url,
    payload = json_set(json_remove(migrated.payload, '$.responsesUrl'), '$.api', 'chat_completions'),
    -- Update queued payloads without changing their delayed prices.
    pending_payload = CASE WHEN migrated.pending_payload IS NULL THEN NULL ELSE
        json_set(json_remove(migrated.pending_payload, '$.responsesUrl'), '$.api', 'chat_completions') END
FROM migrated WHERE endpoint.id = migrated.id;
