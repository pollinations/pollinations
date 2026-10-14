package io.pollinations.minecraft;

import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;

/**
 * A Pollinations API failure carrying a message that is safe and useful to
 * show to a player in chat.
 */
public final class ApiException extends RuntimeException {

    ApiException(String playerMessage) {
        super(playerMessage);
    }

    /** Returns the message to show in-game. */
    public String playerMessage() {
        return getMessage();
    }

    /** Maps an HTTP status and response body to a player-friendly message. */
    static ApiException fromStatus(int status, String body) {
        String snippet = body == null ? "" : body.replaceAll("\\s+", " ").trim();
        if (snippet.length() > 140) {
            snippet = snippet.substring(0, 140) + "…";
        }
        return new ApiException(switch (status) {
            case 400 -> "Pollinations rejected the request" + (snippet.isEmpty() ? "." : ": " + snippet);
            case 401, 403 -> "The Pollinations API key was rejected. Set a valid key with"
                    + " /pollinations key <sk_...> (create one at enter.pollinations.ai/keys).";
            case 402 -> "The server's Pollen balance is too low for this request.";
            case 404 -> "Model not found. Use /pollinations models to see the live list.";
            case 429 -> "Pollinations rate limit reached. Anonymous requests are heavily"
                    + " rate-limited - set a server API key with /pollinations key <sk_...>.";
            default -> "Pollinations error " + status + (snippet.isEmpty() ? "." : ": " + snippet);
        });
    }

    /** Maps a transport failure (timeout, DNS, connection refused, ...) to a friendly message. */
    static ApiException network(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof HttpTimeoutException || c instanceof SocketTimeoutException) {
                return new ApiException("The request to Pollinations timed out. Try again.");
            }
        }
        return new ApiException("Could not reach Pollinations (" + rootMessage(t)
                + "). Check the server's internet connection.");
    }

    /** Unwraps future/completion wrappers and returns the friendliest message for chat. */
    public static String describe(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof ApiException a) {
                return a.playerMessage();
            }
        }
        return network(t).playerMessage();
    }

    private static String rootMessage(Throwable t) {
        Throwable root = t;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        String message = root.getMessage();
        return message == null ? root.getClass().getSimpleName() : message.split("\n")[0];
    }
}
