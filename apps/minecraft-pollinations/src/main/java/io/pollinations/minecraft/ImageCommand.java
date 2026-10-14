package io.pollinations.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.MapMeta;
import org.bukkit.map.MapView;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.List;

/**
 * {@code /draw <prompt>} — generates an image with Pollinations and hands
 * the player a map item showing it.
 */
public final class ImageCommand implements TabExecutor {

    private final PollinationsPlugin plugin;

    public ImageCommand(PollinationsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            Msg.send(sender, Msg.PREFIX + "§7Only players can receive map items.");
            return true;
        }
        if (!player.hasPermission("pollinations.use")) {
            Msg.send(player, Msg.PREFIX + "§cYou do not have permission to use this.");
            return true;
        }
        if (args.length == 0) {
            Msg.send(player, Msg.PREFIX + "§d/draw <prompt> §8- §7turn a prompt into a map image");
            return true;
        }
        String prompt = String.join(" ", args).trim();
        if (prompt.length() < 3) {
            Msg.send(player, Msg.PREFIX + "§7Describe what to draw, e.g. §f/draw a red dragon on a mountain");
            return true;
        }
        if (!plugin.cooldowns().tryAcquire(player.getUniqueId(), plugin.cooldownMillis())) {
            Msg.send(player, Msg.PREFIX + "§7Slow down a moment…");
            return true;
        }

        String model = plugin.imageModel();
        int size = plugin.maxImageSize();
        Msg.send(player, Msg.PREFIX + "§7Painting §f" + Msg.truncate(prompt, 60) + "§7 with §f" + model + "§7…");

        plugin.client().image(prompt, model, size, size)
                .thenApply(this::decode)
                .whenComplete((image, error) -> Bukkit.getScheduler().runTask(plugin, () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    if (error != null) {
                        Msg.send(player, Msg.PREFIX + "§c" + ApiException.describe(error));
                        return;
                    }
                    giveMap(player, image, prompt, model);
                }));
        return true;
    }

    private BufferedImage decode(byte[] bytes) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
            if (image == null) {
                throw new ApiException("Pollinations returned something that is not an image.");
            }
            return image;
        } catch (ApiException e) {
            throw e;
        } catch (java.io.IOException e) {
            throw new ApiException("The image from Pollinations could not be decoded.");
        }
    }

    private void giveMap(Player player, BufferedImage image, String prompt, String model) {
        MapView map = Bukkit.createMap(player.getWorld());
        map.getRenderers().forEach(map::removeRenderer);
        map.addRenderer(new PollinationsMapRenderer(MapImage.toMapPixels(image)));

        ItemStack item = new ItemStack(Material.FILLED_MAP);
        applyMapMeta(item, map, prompt, model);
        player.getInventory().addItem(item).values()
                .forEach(leftover -> player.getWorld().dropItemNaturally(player.getLocation(), leftover));
        Msg.send(player, Msg.PREFIX + "§aHere is your map §7(" + model + ")");
    }

    @SuppressWarnings("deprecation") // setDisplayName/setLore work on every platform
    private static void applyMapMeta(ItemStack item, MapView map, String prompt, String model) {
        MapMeta meta = (MapMeta) item.getItemMeta();
        meta.setDisplayName("§d" + Msg.truncate(prompt, 30));
        meta.setLore(List.of(
                "§8" + model,
                "§7" + Msg.truncate(prompt, 48)));
        meta.setMapView(map);
        item.setItemMeta(meta);
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return List.of("a sunset over an ocean", "a cute creeper", "a castle on a cliff");
        }
        return List.of();
    }
}
