-- Run only after the pollinations-ai publisher allowlist is live in production.
-- Coordinate with the official workflow consumer update because old model names stop resolving.
-- Preserve listing UUIDs, payloads, upstream routes, and historical events.
UPDATE user
SET community_provider_name = (SELECT community_provider_name FROM user WHERE id = 'ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh'),
    community_provider_url = (SELECT community_provider_url FROM user WHERE id = 'ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh'),
    community_provider_icon_url = (SELECT community_provider_icon_url FROM user WHERE id = 'ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh')
WHERE id = 'LJVtOPiUl0C4uRku8kL8prpp95m8jLnt'
  AND github_username = 'pollinations-ai'
  AND github_id = 314960022
  AND community_provider_name IS NULL
  AND community_provider_url IS NULL;

UPDATE community_endpoint
SET owner_user_id = 'LJVtOPiUl0C4uRku8kL8prpp95m8jLnt'
WHERE owner_user_id = 'ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh'
  AND id IN (
    'e1363e66-54b8-49c3-a897-08d99629885f',
    '9a0db868-29cb-4e78-9d44-ba2be6551337',
    '3ba66897-e040-41b5-8cf5-7c561ee5c52f'
  )
  AND EXISTS (
    SELECT 1 FROM user
    WHERE id = 'LJVtOPiUl0C4uRku8kL8prpp95m8jLnt'
      AND github_username = 'pollinations-ai'
      AND github_id = 314960022
      AND banned = 0
      AND community_provider_name = 'Pollinations'
  );
