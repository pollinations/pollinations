package io.pollinations.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabExecutor;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code /pollinations} — admin command for the server API key, the live
 * model lists and a status/health view.
 */
public final class PollinationsCommand implements TabExecutor {

    private final PollinationsPlugin plugin;

    public PollinationsCommand(PollinationsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("pollinations.admin")) {
            Msg.send(sender, Msg.PREFIX + "§cYou do not have permission to manage Pollinations.");
            return true;
        }

        String sub = args.length > 0 ? args[0].toLowerCase() : "status";
        switch (sub) {
            case "key" -> handleKey(sender, args);
            case "models" -> handleModels(sender, args);
            case "status" -> handleStatus(sender);
            default -> sendHelp(sender);
        }
        return true;
    }

    private void handleKey(CommandSender sender, String[] args) {
        if (args.length >= 2 && args[1].equalsIgnoreCase("clear")) {
            plugin.setApiKey(null);
            Msg.send(sender, Msg.PREFIX + "§7API key removed. Requests are now anonymous"
                    + " §8(heavily rate-limited)");
            return;
        }
        if (args.length < 2 || args[1].isBlank()) {
            Msg.send(sender, Msg.PREFIX + "§d/pollinations key <sk_...> §8- set the server key");
            Msg.send(sender, Msg.PREFIX + "§d/pollinations key clear §8- remove it");
            Msg.send(sender, Msg.PREFIX + "§7Create keys at §fhttps://enter.pollinations.ai/keys");
            return;
        }
        String key = args[1].trim();
        plugin.setApiKey(key);
        Msg.send(sender, Msg.PREFIX + "§aServer key saved §7(" + mask(key)
                + "§7). All requests now spend this key's Pollen.");
        if (!key.startsWith("sk_")) {
            Msg.send(sender, Msg.PREFIX + "§eThat does not look like a sk_... key; it may be rejected.");
        }
    }

    private void handleModels(CommandSender sender, String[] args) {
        String kind = args.length > 1 && args[1].equalsIgnoreCase("image") ? "image" : "text";
        Msg.send(sender, Msg.PREFIX + "§7Fetching live " + kind + " models…");
        plugin.client().models(kind).whenComplete((models, error) ->
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (error != null) {
                        Msg.send(sender, Msg.PREFIX + "§c" + ApiException.describe(error));
                        return;
                    }
                    Msg.send(sender, Msg.PREFIX + "§f" + models.size() + " §7" + kind + " models:");
                    for (String line : wrap(models, 60)) {
                        Msg.send(sender, "§8  §7" + line);
                    }
                }));
    }

    private void handleStatus(CommandSender sender) {
        String key = plugin.apiKey();
        Msg.send(sender, Msg.PREFIX + "§7API key: " + (key == null
                ? "§cnot set §8(anonymous, heavily rate-limited)"
                : "§a" + mask(key)));
        Msg.send(sender, Msg.PREFIX + "§7Chat model: §f" + plugin.chatModel());
        Msg.send(sender, Msg.PREFIX + "§7Image model: §f" + plugin.imageModel());
        Msg.send(sender, Msg.PREFIX + "§7Personas: §f" + (plugin.personas().isEmpty()
                ? "§8none configured" : String.join("§8, §f",
                        plugin.personas().stream().map(Persona::name).toList())));
        Msg.send(sender, Msg.PREFIX + "§7Checking API…");
        plugin.client().models("text").whenComplete((models, error) ->
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (error != null) {
                        Msg.send(sender, Msg.PREFIX + "§c" + ApiException.describe(error));
                    } else {
                        Msg.send(sender, Msg.PREFIX + "§aAPI reachable" + (key == null
                                ? " §8(anonymous)" : ", key accepted §8(" + models.size() + " text models)"));
                    }
                }));
    }

    private void sendHelp(CommandSender sender) {
        Msg.send(sender, Msg.PREFIX + "§d/pollinations key <sk_...> §8- §7set the server API key");
        Msg.send(sender, Msg.PREFIX + "§d/pollinations key clear §8- §7remove the key");
        Msg.send(sender, Msg.PREFIX + "§d/pollinations models [text|image] §8- §7live model lists");
        Msg.send(sender, Msg.PREFIX + "§d/pollinations status §8- §7key, models and API health");
    }

    /** Masks a key so only the last characters show in chat or logs. */
    static String mask(String key) {
        return key.length() <= 7 ? "sk_…" : "sk_…" + key.substring(key.length() - 4);
    }

    /** Joins items with ", " and wraps them into lines of at most {@code width} characters. */
    static List<String> wrap(List<String> items, int width) {
        List<String> lines = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String item : items) {
            if (!line.isEmpty() && line.length() + 2 + item.length() > width) {
                lines.add(line.toString());
                line.setLength(0);
            }
            if (!line.isEmpty()) {
                line.append(", ");
            }
            line.append(item);
        }
        if (!line.isEmpty()) {
            lines.add(line.toString());
        }
        return lines;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return filter(List.of("key", "models", "status"), args[0]);
        }
        if (args.length == 2) {
            if (args[0].equalsIgnoreCase("models")) {
                return filter(List.of("text", "image"), args[1]);
            }
            if (args[0].equalsIgnoreCase("key")) {
                return List.of("clear");
            }
        }
        return List.of();
    }

    private static List<String> filter(List<String> options, String prefix) {
        String lower = prefix.toLowerCase();
        return options.stream().filter(o -> o.toLowerCase().startsWith(lower)).toList();
    }
}
