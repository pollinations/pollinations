package io.pollinations.minecraft;

import org.bukkit.map.MapPalette;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Tests the pure image-to-map conversion. */
class MapImageTest {

    private static BufferedImage solid(int width, int height, Color color) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, color.getRGB());
            }
        }
        return image;
    }

    @Test
    void producesExactly128x128Bytes() {
        assertEquals(MapImage.MAP_SIZE * MapImage.MAP_SIZE,
                MapImage.toMapPixels(solid(256, 256, Color.RED)).length);
        assertEquals(MapImage.MAP_SIZE * MapImage.MAP_SIZE,
                MapImage.toMapPixels(solid(64, 64, Color.RED)).length);
        assertEquals(MapImage.MAP_SIZE * MapImage.MAP_SIZE,
                MapImage.toMapPixels(solid(100, 50, Color.RED)).length);
    }

    @Test
    void solidColorsMapToTheirPaletteEntries() {
        for (Color color : new Color[] {Color.WHITE, Color.BLACK, new Color(60, 200, 80)}) {
            byte[] pixels = MapImage.toMapPixels(solid(128, 128, color));
            byte expected = MapPalette.matchColor(color.getRed(), color.getGreen(), color.getBlue());
            for (byte pixel : pixels) {
                assertEquals(expected, pixel, "color " + color);
            }
        }
    }

    @Test
    void solidImageStaysUniformWhenScaled() {
        byte[] pixels = MapImage.toMapPixels(solid(640, 640, Color.BLUE));
        for (byte pixel : pixels) {
            assertEquals(pixels[0], pixel);
        }
    }

    @Test
    void halvesStayOnTheirSideAfterScaling() {
        BufferedImage split = new BufferedImage(256, 256, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 256; y++) {
            for (int x = 0; x < 256; x++) {
                split.setRGB(x, y, x < 128 ? Color.BLACK.getRGB() : Color.WHITE.getRGB());
            }
        }
        byte[] pixels = MapImage.toMapPixels(split);
        assertEquals(MapPalette.matchColor(0, 0, 0), pixels[0]);
        assertEquals(MapPalette.matchColor(255, 255, 255), pixels[pixels.length - 1]);
    }

    @Test
    void gradientProducesManyPaletteColors() {
        BufferedImage gradient = new BufferedImage(128, 128, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 128; x++) {
            for (int y = 0; y < 128; y++) {
                gradient.setRGB(x, y, new Color(x * 2, y * 2, 128).getRGB());
            }
        }
        Set<Integer> distinct = new HashSet<>();
        for (byte pixel : MapImage.toMapPixels(gradient)) {
            distinct.add((int) pixel);
        }
        assertTrue(distinct.size() > 20, "gradient should use many palette colors, got " + distinct.size());
    }

    @Test
    void mostlyTransparentPixelsMapToTransparent() {
        BufferedImage image = new BufferedImage(128, 128, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 128; y++) {
            for (int x = 0; x < 128; x++) {
                image.setRGB(x, y, 0x00FF0000); // fully transparent red
            }
        }
        for (byte pixel : MapImage.toMapPixels(image)) {
            assertEquals(MapImage.TRANSPARENT, pixel);
        }
    }
}
