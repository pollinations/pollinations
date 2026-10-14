package io.pollinations.minecraft;

import org.bukkit.command.CommandSender;

/**
 * Message helper. Messages are written as legacy (§) strings; on Paper they
 * are sent as adventure {@link net.kyori.adventure.text.Component}s, on
 * Spigot (which does not bundle adventure) as plain legacy strings.
 */
public final class Msg {

    /** Chat prefix used for all plugin feedback. */
    public static final String PREFIX = "§8[§dPollinations§8]§r ";

    private Msg() {
    }

    /** Sends a legacy-formatted message to any sender on any supported platform. */
    public static void send(CommandSender to, String legacy) {
        try {
            PaperBridge.send(to, legacy);
        } catch (Throwable missingAdventure /* Spigot: no adventure classes */) {
            to.sendMessage(legacy);
        }
    }

    /** Truncates a string to {@code max} characters, appending an ellipsis when cut. */
    public static String truncate(String text, int max) {
        return text.length() <= max ? text : text.substring(0, Math.max(0, max - 1)) + "…";
    }

    /** Adventure call site, isolated so this class only loads on Paper. */
    private static final class PaperBridge {
        static void send(CommandSender to, String legacy) {
            to.sendMessage(net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
                    .legacySection().deserialize(legacy));
        }
    }
}
