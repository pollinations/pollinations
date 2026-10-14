package io.pollinations.minecraft;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks which villager each player is currently talking to. Players stop
 * talking after {@link #SESSION_MS} of idle time, a sneak-right-click, or by
 * starting a conversation with someone else.
 */
public final class VillagerSessions {

    /** Idle time after which a conversation ends. */
    static final long SESSION_MS = 60_000L;

    /** The villager a player is talking to and when that expires. */
    record Session(UUID villager, String persona, long expiresAt) {
    }

    private final Map<UUID, Session> byPlayer = new ConcurrentHashMap<>();

    /** Starts (or replaces) the player's conversation with a villager. */
    public void start(UUID player, UUID villager, String persona) {
        byPlayer.put(player, new Session(villager, persona, now() + SESSION_MS));
    }

    /** Returns the active session, or null when expired or absent. */
    public Session active(UUID player) {
        Session session = byPlayer.get(player);
        if (session == null) {
            return null;
        }
        if (session.expiresAt() < now()) {
            byPlayer.remove(player);
            return null;
        }
        return session;
    }

    /** Extends the session so it does not expire mid-conversation. */
    public void refresh(UUID player) {
        Session session = byPlayer.get(player);
        if (session != null) {
            byPlayer.put(player, new Session(session.villager(), session.persona(), now() + SESSION_MS));
        }
    }

    /** Ends the player's conversation, if any. */
    public void end(UUID player) {
        byPlayer.remove(player);
    }

    private static long now() {
        return System.currentTimeMillis();
    }
}
