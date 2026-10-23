CREATE TABLE x402_key_purchase (
    payment_id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES user(id),
    key_id TEXT NOT NULL REFERENCES apikey(id),
    pack_key TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    credited_at INTEGER
);
