-- Refresh of 0077 before it reaches production. Keys that list `text` and
-- called a decision model after the 2026-10-16 check also get `decision`, so
-- they keep working on `/alpha/decisions`. The IDs come from a read-only
-- production check on 2026-10-24: generation_event_v2 calls to the decision
-- models since 2026-09-04, joined with keys whose model list includes `text`
-- and not `decision`, minus the keys 0077 already lists (21 keys).
-- Same guards as 0077; rerunning this file changes nothing.
UPDATE apikey
SET permissions = json_insert(permissions, '$.models[#]', 'decision')
WHERE id IN (
    '3JVQF0Lc1001vRDxcb7eZC1N9Pgcn8SD',
    '3abqFjFfchY3GOHb5O9IXv2TJrsYVnp2',
    '4rIRcMWNMqmSdTtlpxOfAYwoEB8ExPuM',
    '8DRgRnETT6AjvK7FF4Mh5uWcFzQzSDgG',
    '9UnDowtBqxkMg2lnzsZl3FilshjESkqG',
    'Ba6358IHORdT2dO9ggbXUyfFOsrPrEQv',
    'C7sR57v2IDpmJh4tFMAdWFZ88LjSbnFB',
    'GDW07amAo1B26CmD2C8T4t6Q3k4Xj7ew',
    'H7fne4IH6M1mzhInhmIghpBcKTC4Fj0V',
    'JSmb5zQXnKl2S18sEnhm9GaK7qtqQY6I',
    'ZrPkllRRmpcUadygdTh63ZIy365DSCue',
    'a2jR3JoCIBMCbO2IsW5rRiWftqbzNcNF',
    'dosburLMLYUFlACq2tOIALalC8HrWJE1',
    'drUR9DXFB3mhfbTHP6BYmdilOE2JHUbV',
    'ewOhtB8Ll1dNSxJfnZNchrB2YLfiUAlL',
    'f1zN4UvZE8fyWWYQEwGAKdErDA4DtRVI',
    'fHfA5dDgNmylcowfXrHurVDiaLJx9pRj',
    'kFKts6Er2bO5qjSdaBULUvhoTzda4ixO',
    'qC3eRJv07JsqlKGCDHNXwdA42OHSdMWw',
    'tdmPk2qJmYvtAVCeiMkMVtmgHGHh9lxZ',
    'udAgkmDyDv1RhpHWrF2Az9insQWi0Q3X'
)
  AND json_valid(permissions)
  AND json_type(permissions, '$.models') = 'array'
  AND EXISTS (
    SELECT 1 FROM json_each(permissions, '$.models') WHERE value = 'text'
  )
  AND NOT EXISTS (
    SELECT 1 FROM json_each(permissions, '$.models') WHERE value = 'decision'
  );
