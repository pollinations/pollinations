CREATE TABLE IF NOT EXISTS media_objects (
    hash TEXT PRIMARY KEY,
    full_sha256 TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT
);

CREATE TABLE IF NOT EXISTS media_entries (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL REFERENCES media_objects(hash) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    verified_app_key_id TEXT,
    verified_app_name TEXT,
    verified_app_owner_user_id TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_entries_owner_hash
    ON media_entries(owner_user_id, hash);

CREATE INDEX IF NOT EXISTS idx_media_entries_owner_created
    ON media_entries(owner_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_media_entries_app_created
    ON media_entries(verified_app_key_id, visibility, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_media_entries_hash_visibility
    ON media_entries(hash, visibility);

CREATE TABLE IF NOT EXISTS media_edges (
    parent_hash TEXT NOT NULL,
    child_hash TEXT NOT NULL REFERENCES media_objects(hash) ON DELETE CASCADE,
    relationship TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    verified_app_key_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (parent_hash, child_hash, relationship, actor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_media_edges_parent_created
    ON media_edges(parent_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS media_tags (
    hash TEXT NOT NULL REFERENCES media_objects(hash) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    verified_app_key_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (hash, tag, verified_app_key_id)
);

CREATE INDEX IF NOT EXISTS idx_media_tags_tag
    ON media_tags(tag, created_at DESC);
