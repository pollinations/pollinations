-- Add the permanent callback to the existing identity-only Flow client.
-- Keep the live preview usable until the release is promoted.
-- Run after release approval; the shared deployment does not modify Enter data.
UPDATE oauth_client
SET name = 'Pollinations Flow',
    redirect_uris = '["https://flow.pollinations.ai/flow-reviewer/auth/callback","https://flow-preview.pollinations.ai/flow-reviewer/auth/callback"]',
    updated_at = unixepoch()
WHERE client_id = 'pk_pollinations_flow_preview';
