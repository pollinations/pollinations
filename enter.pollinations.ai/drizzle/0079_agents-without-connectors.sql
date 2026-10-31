-- Gen refuses agent run tokens on Connectors (composio), and a prompt agent
-- fails its whole run when one of its MCP servers refuses it. Drop Connectors
-- from saved prompt agents so they keep running with their other servers.
-- Prompt agents are the only listings that store MCP servers. This changes
-- every saved prompt agent that lists Connectors, active or not; six of them
-- called Connectors in the 30 days before 2026-10-31 (production Tinybird).
--
-- Prefilter with instr() inside CASE so JSON functions only inspect rows that
-- can contain the ID. json() keeps the array subtype across json_set(), and
-- the aggregate ORDER BY keeps the remaining servers in their saved order.
-- Rerunning this file changes nothing.

UPDATE community_endpoint
SET payload = json_set(
    payload,
    '$.mcpServers',
    json((
        SELECT json_group_array(server.value ORDER BY CAST(server.key AS integer))
        FROM json_each(community_endpoint.payload, '$.mcpServers') AS server
        WHERE server.value != 'composio'
    ))
)
WHERE type = 'prompt_agent'
  AND CASE
    WHEN instr(payload, '"composio"') = 0 THEN 0
    WHEN NOT json_valid(payload) THEN 0
    WHEN json_type(payload, '$.mcpServers') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(payload, '$.mcpServers') AS server
        WHERE server.value = 'composio'
    )
END;
