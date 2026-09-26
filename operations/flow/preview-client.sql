-- One-time provisioning in Enter, only after the scoped preview approval.
-- Public identity client: no client secret, generation key, or wallet access.
INSERT INTO oauth_client (
    id, client_id, disabled, skip_consent, scopes, created_at, updated_at,
    name, redirect_uris, token_endpoint_auth_method, grant_types,
    response_types, public, type, require_pkce
) VALUES (
    'flow-preview', 'pk_pollinations_flow_preview', false, true,
    '["openid","profile","email"]', unixepoch(), unixepoch(),
    'Pollinations Flow preview',
    '["https://flow-preview.pollinations.ai/flow-reviewer/auth/callback"]',
    'none', '["authorization_code"]', '["code"]', true, 'user-agent-based', true
);
