INSERT INTO oauth_application (
  id, client_id, client_secret, client_name, redirect_uris, created_at, updated_at
) VALUES (
  'test-app-id',
  'test-app',
  'test-secret-12345',
  'Test Application',
  '["http://localhost:8080/test-oidc.html"]',
  unixepoch() * 1000,
  unixepoch() * 1000
);
