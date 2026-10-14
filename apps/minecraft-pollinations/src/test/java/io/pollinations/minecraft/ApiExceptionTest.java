package io.pollinations.minecraft;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CompletionException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Tests error mapping and display helpers. */
class ApiExceptionTest {

    @Test
    void mapsRateLimitAndAuthStatuses() {
        assertTrue(ApiException.fromStatus(429, "{}").playerMessage().contains("/pollinations key"));
        assertTrue(ApiException.fromStatus(401, "{}").playerMessage().contains("rejected"));
        assertTrue(ApiException.fromStatus(402, "{}").playerMessage().contains("Pollen"));
        assertTrue(ApiException.fromStatus(404, "{}").playerMessage().contains("/pollinations models"));
        assertTrue(ApiException.fromStatus(500, "{\"error\":\"boom\"}").playerMessage().contains("boom"));
    }

    @Test
    void truncatesLongBodies() {
        String message = ApiException.fromStatus(500, "x".repeat(500)).playerMessage();
        assertTrue(message.length() < 250);
    }

    @Test
    void unwrapsCompletionExceptions() {
        String described = ApiException.describe(
                new CompletionException(ApiException.fromStatus(429, "")));
        assertTrue(described.contains("/pollinations key"));
    }

    @Test
    void masksKeys() {
        assertEquals("sk_…", PollinationsCommand.mask("short"));
        assertEquals("sk_…1234", PollinationsCommand.mask("sk_ABCDEFGH1234"));
    }

    @Test
    void wrapsModelLists() {
        List<String> lines = PollinationsCommand.wrap(
                List.of("openai/gpt-5.4-nano", "openai/gpt-5.4", "anthropic/claude-sol-4.5"), 30);
        assertEquals(List.of("openai/gpt-5.4-nano", "openai/gpt-5.4", "anthropic/claude-sol-4.5"), lines);
    }

    @Test
    void packsShortModelNamesOnOneLine() {
        List<String> lines = PollinationsCommand.wrap(List.of("a", "b", "c"), 10);
        assertEquals(List.of("a, b, c"), lines);
    }
}
