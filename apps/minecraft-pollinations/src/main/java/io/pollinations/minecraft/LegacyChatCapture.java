package io.pollinations.minecraft;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;

/**
 * Fallback chat capture for Spigot (no adventure classes there). On Paper
 * the native {@code PaperChatCapture} is used instead.
 */
final class LegacyChatCapture implements Listener {

    private final PollinationsPlugin plugin;

    LegacyChatCapture(PollinationsPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        if (plugin.handleVillagerChat(event.getPlayer(), event.getMessage())) {
            event.setCancelled(true);
        }
    }
}
