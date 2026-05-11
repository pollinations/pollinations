-- Initial media schema setup
CREATE TABLE IF NOT EXISTS media_objects (
    hash TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public_tags (
    hash TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (hash, tag),
    FOREIGN KEY (hash) REFERENCES media_objects(hash) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS private_tags (
    hash TEXT NOT NULL,
    owner TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (hash, owner, tag),
    FOREIGN KEY (hash) REFERENCES media_objects(hash) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_public_tags_tag ON public_tags(tag);
CREATE INDEX IF NOT EXISTS idx_private_tags_owner_hash ON private_tags(owner, hash);
CREATE INDEX IF NOT EXISTS idx_media_objects_owner ON media_objects(owner);
