# Pollicraft Backend

This folder contains the PocketBase backend source for Pollicraft. It is included for the special Pollinations quest PR with maintainer approval, even though the original quest text defaulted to frontend-only demos.

Only source files should be copied into `apps/pollicraft/backend/`: `pb_hooks/`, `pb_migrations/`, this README, and backend ignore/config files. Do not commit `pb_data/`, `pocketbase.exe`, generated databases, generated storage, user data, avatars, or Pollen keys.

## Runtime

Pollicraft uses PocketBase JavaScript hooks and migrations. It was tested with PocketBase `0.38.0`. For a clean open-source setup, install PocketBase separately instead of committing the binary.

```sh
pocketbase serve
```

For production, run the same hooks and migrations on PocketHost or another PocketBase host. The frontend should point to that instance with `PUBLIC_PB_URL`.

## Source Layout

- `pb_hooks/main.pb.js`: route and validation hook registration.
- `pb_hooks/pollicraft.js`: identity verification, seed inventory, crafting, Pollinations text/image calls, and response mapping.
- `pb_migrations/`: PocketBase schema migrations for the game collections.

## Collections

The migrations create and update these game collections:

- `profiles`: one record per verified Pollinations account, keyed by email.
- `elements`: shared global atlas of seed and crafted elements. Each record stores name, description, discoverer, recipe ingredients, slug, and optional image.
- `inventories`: per-profile ownership of elements.

The elements schema currently stores recipe ingredients in a field named `ingridients`. Keep that field name for migration compatibility unless a deliberate migration renames it everywhere.

## Authentication

The frontend sends a player-provided Pollinations key and email to the backend. The backend verifies the key against:

```txt
GET https://enter.pollinations.ai/api/device/userinfo
Authorization: Bearer <pollen key>
```

The request is rejected if the verified Pollinations email does not match the submitted email. Keys are not stored in PocketBase.

## Pollinations APIs

New recipes call Pollinations text generation first:

```txt
POST https://gen.pollinations.ai/v1/chat/completions
Authorization: Bearer <pollen key>
```

The response is expected to be JSON with `name` and `description`.

If the `elements.image` field exists, the backend also asks PocketBase to download an image from:

```txt
GET https://gen.pollinations.ai/image/{prompt}?model=flux&key=<pollen key>
```

If image download fails, the element is still saved as text-only.

## API Contract

### POST /inventory

Headers:

```txt
X-Pollen-Key: <player pollen key>
X-User-Email: <verified email>
Content-Type: application/json
```

Body:

```json
{
  "userEmail": "player@example.com",
  "pollenKey": "..."
}
```

Response:

```json
{
  "elements": [],
  "firstDiscoveryCount": 0
}
```

Behavior:

- Verifies the Pollinations identity.
- Upserts the `profiles` record.
- Ensures Water, Fire, Wind, and Earth exist.
- Ensures the player owns all seed elements.
- Returns the player's inventory.

### POST /craft

Headers:

```txt
X-Pollen-Key: <player pollen key>
X-User-Email: <verified email>
Content-Type: application/json
```

Body:

```json
{
  "leftId": "seedwater00000",
  "rightId": "seedfire000000",
  "userEmail": "player@example.com",
  "pollenKey": "..."
}
```

Response:

```json
{
  "element": {
    "id": "element_id",
    "name": "Steam",
    "description": "A pale vapor rising where heat persuades water upward.",
    "collectionName": "elements",
    "discovererDisplayName": "Player"
  },
  "firstDiscovery": true,
  "source": "ai-sim"
}
```

`source` is `global-cache` when an existing recipe is reused and `ai-sim` when Pollinations generated a new element.

## Error Cases

- Missing key or email: request is rejected.
- Identity mismatch: request is rejected.
- Unknown ingredient: request is rejected.
- Ingredient not in the player's inventory: request is rejected.
- Pollinations generation failure: crafting returns an error instead of creating an incomplete element.

## Fresh Instance Checklist

1. Install PocketBase locally or create a PocketHost instance.
2. Copy `pb_hooks/` and `pb_migrations/` into the instance root.
3. Run `pocketbase serve`.
4. Confirm migrations apply from an empty `pb_data/`.
5. Set the frontend `PUBLIC_PB_URL` to this backend URL.
6. Connect a Pollinations account in the frontend and call `/inventory`.

## Security Notes

Do not commit:

- `pb_data/`
- `pocketbase.exe` or platform binaries
- generated storage files
- `.env`
- local databases
- profile avatars or generated element images
- Pollen keys or bearer tokens

The open-source PR should contain backend source and reproducible schema only.
