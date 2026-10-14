package io.pollinations.minecraft;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Tests persona parsing and lookup (the config-facing pure logic). */
class PersonaTest {

    @Test
    void parsesConfigRows() {
        List<Persona> personas = Persona.fromConfig(List.of(
                Map.of("name", "Elara", "personality", "kind librarian", "model", "openai/gpt-5.4-nano"),
                Map.of("name", "Gorik", "personality", "gruff smith"),
                Map.of("personality", "missing a name"),
                Map.of("name", "NoPersonality")));
        assertEquals(2, personas.size());
        assertEquals("Elara", personas.get(0).name());
        assertEquals("kind librarian", personas.get(0).personality());
        assertEquals("openai/gpt-5.4-nano", personas.get(0).model());
        assertNull(personas.get(1).model());
    }

    @Test
    void handlesNullAndEmptyRows() {
        assertEquals(0, Persona.fromConfig(null).size());
        assertEquals(0, Persona.fromConfig(List.of()).size());
        assertEquals(0, Persona.fromConfig(java.util.Arrays.asList(null, null)).size());
    }

    @Test
    void findsIgnoringCaseColorCodesAndWhitespace() {
        List<Persona> personas = Persona.fromConfig(List.of(
                Map.of("name", "Elara", "personality", "librarian")));
        assertTrue(Persona.find(personas, "elara").isPresent());
        assertTrue(Persona.find(personas, "  ELARA ").isPresent());
        assertTrue(Persona.find(personas, "§6Elara§r").isPresent());
        assertTrue(Persona.find(personas, "Gorik").isEmpty());
        assertTrue(Persona.find(personas, null).isEmpty());
        assertTrue(Persona.find(personas, "").isEmpty());
    }

    @Test
    void modelOrFallsBackWhenBlank() {
        Persona blank = new Persona("A", "x", " ");
        Persona set = new Persona("B", "x", "m");
        assertEquals("default", blank.modelOr("default"));
        assertEquals("m", set.modelOr("default"));
    }

    @Test
    void cleanStripsSectionCodes() {
        assertEquals("Elara", Persona.clean("§5Elara§r"));
        assertEquals("", Persona.clean(null));
    }
}
