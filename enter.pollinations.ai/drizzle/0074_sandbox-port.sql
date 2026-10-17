-- Sandbox ports gen serves at its own domain: a request wakes the sandbox, and
-- the key that shared the port, or without one the owner, pays the lease.
CREATE TABLE `sandbox_port` (
    `sandbox_id` text NOT NULL,
    `port` integer NOT NULL,
    `api_key_id` text REFERENCES `apikey`(`id`) ON DELETE cascade,
    PRIMARY KEY (`sandbox_id`, `port`)
);
