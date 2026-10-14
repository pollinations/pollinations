package io.pollinations.minecraft;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

/**
 * Async HTTP client for the Pollinations API ({@code https://gen.pollinations.ai}).
 * Every method returns a {@link CompletableFuture} completed on the JDK
 * HttpClient's own executor, so callers never block the server threads.
 * Failures complete the future with {@link ApiException}.
 */
public final class PollinationsClient {

    /** Live API base URL. */
    public static final String BASE_URL = "https://gen.pollinations.ai";

    private final Supplier<String> apiKey;
    private final Supplier<Duration> timeout;
    private final Gson gson = new Gson();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    /**
     * @param apiKey  supplies the server API key (empty/null for anonymous, heavily rate-limited)
     * @param timeout supplies the per-request timeout
     */
    public PollinationsClient(Supplier<String> apiKey, Supplier<Duration> timeout) {
        this.apiKey = apiKey;
        this.timeout = timeout;
    }

    /**
     * Runs one OpenAI-compatible chat completion.
     *
     * @param model    model name from the live text model list
     * @param messages conversation turns; the first is usually the persona system prompt
     * @return the assistant reply text
     */
    public CompletableFuture<String> chat(String model, List<ChatMessage> messages) {
        List<Map<String, String>> turns = new ArrayList<>();
        for (ChatMessage m : messages) {
            turns.add(Map.of("role", m.role(), "content", m.content()));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", turns);

        HttpRequest request = builder("/v1/chat/completions")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body), StandardCharsets.UTF_8))
                .build();

        return send(request, HttpResponse.BodyHandlers.ofString()).thenApply(response -> {
            requireOk(response, response.body());
            JsonObject root = JsonParser.parseString(response.body()).getAsJsonObject();
            JsonElement content = root.getAsJsonArray("choices").get(0).getAsJsonObject()
                    .getAsJsonObject("message").get("content");
            return content == null || content.isJsonNull() ? "" : content.getAsString();
        });
    }

    /**
     * Generates an image for a prompt.
     *
     * @param prompt the text to render
     * @param model  model name from the live image model list
     * @param width  image width in pixels
     * @param height image height in pixels
     * @return the raw image bytes (usually JPEG)
     */
    public CompletableFuture<byte[]> image(String prompt, String model, int width, int height) {
        String query = "?model=" + encode(model) + "&width=" + width + "&height=" + height;
        HttpRequest request = builder("/image/" + encode(prompt) + query).GET().build();

        return send(request, HttpResponse.BodyHandlers.ofByteArray()).thenApply(response -> {
            String contentType = response.headers().firstValue("Content-Type").orElse("");
            if (response.statusCode() == 200 && contentType.startsWith("image/")) {
                return response.body();
            }
            requireOk(response, new String(response.body(), StandardCharsets.UTF_8));
            throw ApiException.fromStatus(502, "Unexpected response (" + contentType + ")");
        });
    }

    /**
     * Fetches the live model name list.
     *
     * @param kind {@code "text"} or {@code "image"}
     */
    public CompletableFuture<List<String>> models(String kind) {
        HttpRequest request = builder("/" + kind + "/models").GET().build();

        return send(request, HttpResponse.BodyHandlers.ofString()).thenApply(response -> {
            requireOk(response, response.body());
            JsonArray entries = JsonParser.parseString(response.body()).getAsJsonArray();
            List<String> names = new ArrayList<>();
            for (JsonElement entry : entries) {
                JsonObject object = entry.getAsJsonObject();
                if (object.has("name")) {
                    names.add(object.get("name").getAsString());
                }
            }
            return names;
        });
    }

    private HttpRequest.Builder builder(String pathAndQuery) {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(BASE_URL + pathAndQuery))
                .timeout(timeout.get());
        String key = apiKey.get();
        if (key != null && !key.isBlank()) {
            request.header("Authorization", "Bearer " + key.trim());
        }
        return request;
    }

    private <T> CompletableFuture<HttpResponse<T>> send(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
        CompletableFuture<HttpResponse<T>> done = new CompletableFuture<>();
        http.sendAsync(request, handler).whenComplete((response, error) -> {
            if (error != null) {
                done.completeExceptionally(ApiException.network(error));
            } else {
                done.complete(response);
            }
        });
        return done;
    }

    private static void requireOk(HttpResponse<?> response, String body) {
        if (response.statusCode() != 200) {
            throw ApiException.fromStatus(response.statusCode(), body);
        }
    }

    /** Encodes for a URI path/query; {@code +} is replaced so spaces survive in the path. */
    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
