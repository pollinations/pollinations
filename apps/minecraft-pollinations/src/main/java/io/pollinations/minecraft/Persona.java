package io.pollinations.minecraft;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * A named AI persona shared by villagers and the {@code /ai} command.
 *
 * @param name        persona name; villagers are matched by this, ignoring case and color codes
 * @param personality the system prompt describing how the persona talks
 * @param model       chat model override; null or blank falls back to the configured default
 */
public record Persona(String name, String personality, String model) {

    /**
     * Parses personas from config rows shaped like
     * {@code {name: Elara, personality: ..., model: ...}}. Rows without a
     * name or personality are skipped.
     */
    public static List<Persona> fromConfig(List<Map<?, ?>> rows) {
        List<Persona> personas = new ArrayList<>();
        if (rows == null) {
            return personas;
        }
        for (Map<?, ?> row : rows) {
            if (row == null) {
                continue;
            }
            Object name = row.get("name");
            Object personality = row.get("personality");
            Object model = row.get("model");
            if (name == null || personality == null) {
                continue;
            }
            personas.add(new Persona(clean(name.toString()), personality.toString(),
                    model == null ? null : model.toString()));
        }
        return personas;
    }

    /**
     * Finds a persona by name, ignoring case, surrounding whitespace and
     * {@code §} color codes.
     */
    public static Optional<Persona> find(List<Persona> personas, String name) {
        String wanted = clean(name).toLowerCase(Locale.ROOT);
        if (wanted.isEmpty()) {
            return Optional.empty();
        }
        return personas.stream()
                .filter(p -> p.name().toLowerCase(Locale.ROOT).equals(wanted))
                .findFirst();
    }

    /** Strips {@code §} color codes and trims whitespace. */
    public static String clean(String value) {
        return value == null ? "" : value.replaceAll("§.", "").trim();
    }

    /** Returns this persona's model, or {@code fallback} when unset. */
    public String modelOr(String fallback) {
        return model == null || model.isBlank() ? fallback : model;
    }
}
