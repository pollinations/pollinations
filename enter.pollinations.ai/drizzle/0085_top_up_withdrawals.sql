CREATE TABLE withdrawal_request (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE,
    purchase TEXT NOT NULL,
    statement TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    ip_key TEXT
);
CREATE INDEX withdrawal_request_email_time ON withdrawal_request(email, received_at);
CREATE INDEX withdrawal_request_ip_time ON withdrawal_request(ip_key, received_at) WHERE ip_key IS NOT NULL;
CREATE INDEX withdrawal_request_received ON withdrawal_request(received_at);

CREATE TABLE withdrawal_delivery (
    request_id TEXT NOT NULL REFERENCES withdrawal_request(id) ON DELETE CASCADE,
    recipient TEXT NOT NULL CHECK (recipient IN ('buyer', 'billing', 'billing_followup')),
    next_attempt_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (request_id, recipient)
);
CREATE INDEX withdrawal_delivery_due ON withdrawal_delivery(next_attempt_at);

-- Acceptance and both delivery jobs commit together, including on request retries.
CREATE TRIGGER withdrawal_request_deliveries AFTER INSERT ON withdrawal_request
BEGIN
    INSERT INTO withdrawal_delivery (request_id, recipient, next_attempt_at)
    VALUES (NEW.id, 'buyer', NEW.received_at), (NEW.id, 'billing', NEW.received_at);
END;
