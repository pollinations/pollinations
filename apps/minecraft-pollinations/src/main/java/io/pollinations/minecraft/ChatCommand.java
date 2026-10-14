package io.pollinations.minecraft;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Optional;

/**
 * {@code /ai} — chat with an AI persona. Personas come from the shared
 * persona list in config.yml and each keeps its own short memory per player.
 */
public final class ChatCommand implements TabExecutor {

    private final PollinationsPlugin plugin;

    public ChatCommand(PollinationsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            Msg.send(sender, Msg.PREFIX + "§7Only players can chat with personas.");
            return true;
        }
        if (!player.hasPermission("pollinations.use")) {
            Msg.send(player, Msg.PREFIX + "§cYou do not have permission to use this.");
            return true;
        }

        if (args.length == 0 || args[0].equalsIgnoreCase("help")) {
            sendHelp(player);
            return true;
        }

        if (args[0].equalsIgnoreCase("reset")) {
            Persona persona = currentPersona(player);
            plugin.conversations().clear(chatKey(persona, player));
            Msg.send(player, Msg.PREFIX + "§7Cleared your conversation with §f" + persona.name() + "§7.");
            return true;
        }

        if (args[0].equalsIgnoreCase("persona")) {
            handlePersona(player, args);
            return true;
        }

        Persona persona = currentPersona(player);
        String message = String.join(" ", args).trim();
        if (message.isEmpty()) {
            sendHelp(player);
            return true;
        }
        if (!plugin.cooldowns().tryAcquire(player.getUniqueId(), plugin.cooldownMillis())) {
            Msg.send(player, Msg.PREFIX + "§7Slow down a moment…");
            return true;
        }
        Msg.send(player, Msg.PREFIX + "§8…");
        plugin.chatAsPersona(player, chatKey(persona, player), persona, message);
        return true;
    }

    private void handlePersona(Player player, String[] args) {
        if (args.length == 1) {
            StringBuilder list = new StringBuilder(Msg.PREFIX + "§7Personas: ");
            for (Persona persona : plugin.personas()) {
                list.append("§f").append(persona.name()).append("§8, ");
            }
            if (plugin.personas().isEmpty()) {
                list.append("§8none configured");
            } else {
                list.setLength(list.length() - 2);
            }
            Msg.send(player, list.toString());
            Msg.send(player, Msg.PREFIX + "§7Current: §f" + currentPersona(player).name()
                    + "§8 (memory is kept per persona)");
            return;
        }
        Optional<Persona> persona = Persona.find(plugin.personas(), args[1]);
        if (persona.isEmpty()) {
            Msg.send(player, Msg.PREFIX + "§cUnknown persona §f" + args[1]
                    + "§c. Use /ai persona to list them.");
            return;
        }
        plugin.selectPersona(player, persona.get().name());
        Msg.send(player, Msg.PREFIX + "§7Now chatting with §f" + persona.get().name() + "§7.");
    }

    private void sendHelp(Player player) {
        Msg.send(player, Msg.PREFIX + "§d/ai <message> §8- §7chat with §f"
                + currentPersona(player).name());
        Msg.send(player, Msg.PREFIX + "§d/ai persona §8- §7list personas");
        Msg.send(player, Msg.PREFIX + "§d/ai persona <name> §8- §7switch persona");
        Msg.send(player, Msg.PREFIX + "§d/ai reset §8- §7clear this persona's memory");
    }

    /** The persona selected by the player, or a sensible default. */
    Persona currentPersona(Player player) {
        String selected = plugin.selectedPersona(player);
        if (selected != null) {
            Optional<Persona> persona = Persona.find(plugin.personas(), selected);
            if (persona.isPresent()) {
                return persona.get();
            }
        }
        if (plugin.personas().isEmpty()) {
            return PollinationsPlugin.FALLBACK_PERSONA;
        }
        return Persona.find(plugin.personas(), "assistant").orElse(plugin.personas().get(0));
    }

    static String chatKey(Persona persona, Player player) {
        return "c:" + persona.name() + ":" + player.getUniqueId();
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return filter(List.of("persona", "reset"), args[0]);
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("persona")) {
            return filter(plugin.personas().stream().map(Persona::name).toList(), args[1]);
        }
        return List.of();
    }

    private static List<String> filter(List<String> options, String prefix) {
        String lower = prefix.toLowerCase();
        return options.stream().filter(o -> o.toLowerCase().startsWith(lower)).toList();
    }
}
