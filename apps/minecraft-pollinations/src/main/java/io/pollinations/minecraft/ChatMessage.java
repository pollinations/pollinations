package io.pollinations.minecraft;

/** One turn of a chat conversation, in OpenAI chat format. */
public record ChatMessage(String role, String content) {

    /** Creates a system (persona) turn. */
    public static ChatMessage system(String content) {
        return new ChatMessage("system", content);
    }

    /** Creates a user turn. */
    public static ChatMessage user(String content) {
        return new ChatMessage("user", content);
    }

    /** Creates an assistant turn. */
    public static ChatMessage assistant(String content) {
        return new ChatMessage("assistant", content);
    }
}
