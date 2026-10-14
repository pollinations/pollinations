package io.pollinations.minecraft;

import org.bukkit.map.MapPalette;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;

/**
 * Converts an image to the 128x128 Minecraft map byte format, one
 * {@link MapPalette} color per pixel (row-major, {@code y * 128 + x}).
 */
public final class MapImage {

    /** Side length of a Minecraft map in pixels. */
    public static final int MAP_SIZE = 128;

    /** The map palette's transparent color index. */
    public static final byte TRANSPARENT = 0;

    private MapImage() {
    }

    /**
     * Scales {@code image} to 128x128 and converts it to map palette bytes.
     * Pixels that are mostly transparent map to the transparent palette entry.
     *
     * @return 16384 bytes, one per map pixel
     */
    public static byte[] toMapPixels(BufferedImage image) {
        BufferedImage scaled = scale(image);
        byte[] pixels = new byte[MAP_SIZE * MAP_SIZE];
        for (int y = 0; y < MAP_SIZE; y++) {
            for (int x = 0; x < MAP_SIZE; x++) {
                int argb = scaled.getRGB(x, y);
                pixels[y * MAP_SIZE + x] = (argb >>> 24) < 128
                        ? TRANSPARENT
                        : MapPalette.matchColor((argb >> 16) & 0xFF, (argb >> 8) & 0xFF, argb & 0xFF);
            }
        }
        return pixels;
    }

    private static BufferedImage scale(BufferedImage image) {
        if (image.getWidth() == MAP_SIZE && image.getHeight() == MAP_SIZE) {
            return image;
        }
        BufferedImage scaled = new BufferedImage(MAP_SIZE, MAP_SIZE, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = scaled.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING,
                    RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(image, 0, 0, MAP_SIZE, MAP_SIZE, null);
        } finally {
            graphics.dispose();
        }
        return scaled;
    }
}
