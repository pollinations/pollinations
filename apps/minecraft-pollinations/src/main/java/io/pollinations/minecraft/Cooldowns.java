package io.pollinations.minecraft;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-player request cooldown so one player cannot drain the server's
 * Pollen with spam. Thread-safe (checked from async chat events too).
 */
final class Cooldowns {

    private final Map<UUID, Long> lastRequest = new ConcurrentHashMap<>();

    /**
     * Returns true and stamps the time when at least {@code minMillis} has
     * passed since the player's last granted request, false when the player
     * is still cooling down.
     */
    boolean tryAcquire(UUID player, long minMillis) {
        if (minMillis <= 0) {
            return true;
        }
        long now = System.currentTimeMillis();
        Long previous = lastRequest.put(player, now);
        return previous == null || now - previous >= minMillis;
    }
}
