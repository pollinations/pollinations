package io.pollinations.minecraft;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

/**
 * Routes Paper chat lines to an active villager conversation. Only
 * registered on Paper, where {@link AsyncChatEvent} exists.
 */
final class PaperChatCapture implements Listener {

    private final PollinationsPlugin plugin;

    PaperChatCapture(PollinationsPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onChat(AsyncChatEvent event) {
        String message = PlainTextComponentSerializer.plainText().serialize(event.message());
        if (plugin.handleVillagerChat(event.getPlayer(), message)) {
            event.setCancelled(true);
        }
    }
}
