package io.pollinations.minecraft;

import org.bukkit.entity.Player;
import org.bukkit.map.MapCanvas;
import org.bukkit.map.MapRenderer;
import org.bukkit.map.MapView;

/**
 * Draws a fixed image onto a map once. Pair with
 * {@link MapView#removeRenderer(org.bukkit.map.MapRenderer)} on the vanilla
 * renderer so only the image shows.
 */
final class PollinationsMapRenderer extends MapRenderer {

    private final byte[] pixels;
    private boolean drawn;

    PollinationsMapRenderer(byte[] pixels) {
        this.pixels = pixels.clone();
    }

    @Override
    public void render(MapView map, MapCanvas canvas, Player player) {
        if (drawn) {
            return;
        }
        drawn = true;
        for (int y = 0; y < MapImage.MAP_SIZE; y++) {
            for (int x = 0; x < MapImage.MAP_SIZE; x++) {
                canvas.setPixel(x, y, pixels[y * MapImage.MAP_SIZE + x]);
            }
        }
    }
}
