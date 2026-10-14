package io.pollinations.minecraft;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short conversation memory, keyed by conversation (for example
 * {@code persona + player} or {@code villager + player}). Thread-safe.
 */
public final class Conversations {

    private final int cap;
    private final Map<String, Deque<ChatMessage>> store = new ConcurrentHashMap<>();

    /**
     * @param cap maximum remembered turns per conversation (0 disables memory)
     */
    public Conversations(int cap) {
        this.cap = Math.max(0, cap);
    }

    /** Returns the remembered turns, oldest first; never null. */
    public List<ChatMessage> history(String key) {
        Deque<ChatMessage> turns = store.get(key);
        if (turns == null) {
            return List.of();
        }
        synchronized (turns) {
            return new ArrayList<>(turns);
        }
    }

    /** Appends one turn and trims the conversation to the capacity. */
    public void append(String key, ChatMessage message) {
        if (cap == 0) {
            return;
        }
        Deque<ChatMessage> turns = store.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (turns) {
            turns.addLast(message);
            while (turns.size() > cap) {
                turns.removeFirst();
            }
        }
    }

    /** Forgets one conversation. */
    public void clear(String key) {
        store.remove(key);
    }
}
