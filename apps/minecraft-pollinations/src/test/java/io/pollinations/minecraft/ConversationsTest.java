package io.pollinations.minecraft;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Tests conversation memory and the per-player cooldown guard. */
class ConversationsTest {

    @Test
    void keepsTurnsInOrderAndCapsHistory() {
        Conversations conversations = new Conversations(3);
        for (int i = 1; i <= 5; i++) {
            conversations.append("k", ChatMessage.user("m" + i));
        }
        List<ChatMessage> history = conversations.history("k");
        assertEquals(3, history.size());
        assertEquals("m3", history.get(0).content());
        assertEquals("m5", history.get(2).content());
        assertEquals("user", history.get(0).role());
    }

    @Test
    void keysAreIsolated() {
        Conversations conversations = new Conversations(10);
        conversations.append("a", ChatMessage.user("hello"));
        assertTrue(conversations.history("b").isEmpty());
        assertEquals(1, conversations.history("a").size());
        conversations.clear("a");
        assertTrue(conversations.history("a").isEmpty());
    }

    @Test
    void zeroCapDisablesMemory() {
        Conversations conversations = new Conversations(0);
        conversations.append("k", ChatMessage.user("hello"));
        assertTrue(conversations.history("k").isEmpty());
    }

    @Test
    void cooldownGrantsThenBlocks() {
        Cooldowns cooldowns = new Cooldowns();
        UUID player = UUID.randomUUID();
        assertTrue(cooldowns.tryAcquire(player, 60_000));
        assertFalse(cooldowns.tryAcquire(player, 60_000));
        assertFalse(cooldowns.tryAcquire(player, 60_000));
    }

    @Test
    void zeroCooldownAlwaysGrants() {
        Cooldowns cooldowns = new Cooldowns();
        UUID player = UUID.randomUUID();
        assertTrue(cooldowns.tryAcquire(player, 0));
        assertTrue(cooldowns.tryAcquire(player, 0));
    }
}
