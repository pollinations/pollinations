package io.pollinations.minecraft;

import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.inventory.EquipmentSlot;

import java.util.Optional;
import java.util.UUID;

/**
 * Right-click a villager named after a configured persona to chat with it.
 * The greeting and every reply use that persona; the conversation continues
 * with normal chat messages (see the chat capture listeners) and ends after
 * 60 seconds of idle time or a sneak-right-click.
 */
public final class VillagerChatListener implements Listener {

    private final PollinationsPlugin plugin;
    private final VillagerSessions sessions;

    public VillagerChatListener(PollinationsPlugin plugin, VillagerSessions sessions) {
        this.plugin = plugin;
        this.sessions = sessions;
    }

    /** Handles right-clicks on persona villagers. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    @SuppressWarnings("deprecation") // getCustomName() works on every platform; Paper prefers customName()
    public void onInteract(PlayerInteractEntityEvent event) {
        if (event.getHand() != EquipmentSlot.HAND
                || !(event.getRightClicked() instanceof Villager villager)
                || villager.getCustomName() == null) {
            return;
        }
        Optional<Persona> match = Persona.find(plugin.personas(), villager.getCustomName());
        if (match.isEmpty()) {
            return;
        }

        Player player = event.getPlayer();
        Persona persona = match.get();
        event.setCancelled(true); // the villager wants to talk, not trade

        UUID playerId = player.getUniqueId();
        if (player.isSneaking()) {
            sessions.end(playerId);
            Msg.send(player, Msg.PREFIX + "§7You wave goodbye to §f" + persona.name() + "§7.");
            return;
        }
        if (!player.hasPermission("pollinations.use")) {
            Msg.send(player, Msg.PREFIX + "§7This villager ignores you.");
            return;
        }

        UUID villagerId = villager.getUniqueId();
        if (sessions.active(playerId) instanceof VillagerSessions.Session session
                && session.villager().equals(villagerId)) {
            sessions.refresh(playerId);
            Msg.send(player, Msg.PREFIX + "§7You are already talking to §f" + persona.name()
                    + "§7 - just type in chat. §8Sneak-right-click to end.");
            return;
        }
        if (!plugin.cooldowns().tryAcquire(playerId, plugin.cooldownMillis())) {
            Msg.send(player, Msg.PREFIX + "§7" + persona.name() + " is catching their breath…");
            return;
        }

        sessions.start(playerId, villagerId, persona.name());
        Msg.send(player, "§6" + persona.name() + " §7turns to face you. §8Type to talk, "
                + "sneak-right-click to leave.");
        String greeting = "The player " + player.getName()
                + " just walked up to you and wants to talk. Greet them in one short sentence.";
        plugin.chatAsPersona(player, villagerKey(villagerId, playerId), persona, greeting);
    }

    /** Memory key for a player talking to a specific villager. */
    static String villagerKey(UUID villager, UUID player) {
        return "v:" + villager + ":" + player;
    }
}
