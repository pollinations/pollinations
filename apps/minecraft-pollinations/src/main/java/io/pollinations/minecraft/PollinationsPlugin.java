package io.pollinations.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.command.PluginCommand;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Pollinations for Minecraft — chatting villagers and prompt-to-map art,
 * powered by https://gen.pollinations.ai. Server owners configure their own
 * API key; every player request spends the server's Pollen.
 */
public final class PollinationsPlugin extends JavaPlugin {

    /** Turns of conversation remembered per player and persona. */
    private static final int HISTORY_TURNS = 10;

    /** Persona used when the config defines none. */
    static final Persona FALLBACK_PERSONA = new Persona("AI",
            "You are a helpful assistant for a Minecraft player.", null);

    private static final String DEFAULT_CHAT_MODEL = "openai/gpt-5.4-nano";
    private static final String DEFAULT_IMAGE_MODEL = "tongyi-mai/z-image-turbo";

    private final AtomicReference<String> apiKey = new AtomicReference<>();
    private final Map<UUID, String> selectedPersona = new ConcurrentHashMap<>();
    private final Cooldowns cooldowns = new Cooldowns();

    private PollinationsClient client;
    private VillagerSessions sessions;
    private Conversations conversations;
    private List<Persona> personas = List.of();
    private String chatModel = DEFAULT_CHAT_MODEL;
    private String imageModel = DEFAULT_IMAGE_MODEL;
    private int maxImageSize = 1024;
    private long timeoutSeconds = 60;
    private long cooldownSeconds = 3;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        loadSettings();
        client = new PollinationsClient(apiKey::get, () -> Duration.ofSeconds(timeoutSeconds));
        sessions = new VillagerSessions();
        conversations = new Conversations(HISTORY_TURNS);

        register("ai", new ChatCommand(this));
        register("draw", new ImageCommand(this));
        register("pollinations", new PollinationsCommand(this));

        var manager = getServer().getPluginManager();
        manager.registerEvents(new VillagerChatListener(this, sessions), this);
        if (hasClass("io.papermc.paper.event.player.AsyncChatEvent")) {
            manager.registerEvents(new PaperChatCapture(this), this);
        } else {
            manager.registerEvents(new LegacyChatCapture(this), this);
        }
        getLogger().info("Enabled with " + personas.size() + " personas, chat model "
                + chatModel + ", image model " + imageModel + ", API key "
                + (apiKey.get() == null ? "not set (anonymous)" : "configured"));
    }

    private void loadSettings() {
        var config = getConfig();
        String key = config.getString("apiKey", "");
        apiKey.set(key == null || key.isBlank() ? null : key.trim());
        chatModel = config.getString("chatModel", DEFAULT_CHAT_MODEL);
        imageModel = config.getString("imageModel", DEFAULT_IMAGE_MODEL);
        maxImageSize = clamp(config.getInt("maxImageSize", 1024), 128, 2048);
        timeoutSeconds = clamp(config.getInt("requestTimeout", 60), 5, 600);
        cooldownSeconds = clamp(config.getInt("cooldownSeconds", 3), 0, 600);
        personas = Persona.fromConfig(config.getMapList("villagerPersonas"));
        if (personas.isEmpty()) {
            getLogger().warning("No villagerPersonas configured; using the fallback persona for /ai.");
        }
    }

    private void register(String name, TabExecutor executor) {
        PluginCommand command = getCommand(name);
        if (command == null) {
            throw new IllegalStateException("Command " + name + " missing from plugin.yml");
        }
        command.setExecutor(executor);
        command.setTabCompleter(executor);
    }

    /**
     * Runs one persona chat turn for a player: appends memory, calls the
     * API off the main thread and relays the reply in chat when it arrives.
     *
     * @param memoryKey conversation memory key (persona or villager scoped)
     * @param userText  what the player said
     */
    public void chatAsPersona(Player player, String memoryKey, Persona persona, String userText) {
        conversations.append(memoryKey, ChatMessage.user(userText));
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(persona.personality()
                + " You are chatting with a Minecraft player in game chat;"
                + " keep replies to 1-3 short sentences unless asked for more."));
        messages.addAll(conversations.history(memoryKey)); // already capped at HISTORY_TURNS

        client.chat(persona.modelOr(chatModel), messages)
                .whenComplete((reply, error) -> Bukkit.getScheduler().runTask(this, () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    if (error != null) {
                        Msg.send(player, Msg.PREFIX + "§c" + ApiException.describe(error));
                        return;
                    }
                    conversations.append(memoryKey, ChatMessage.assistant(reply));
                    Msg.send(player, "§6<" + persona.name() + "> §f" + reply);
                }));
    }

    /**
     * Routes a chat line to the villager the player is talking to.
     *
     * @return true when the line was consumed (the chat event should cancel)
     */
    public boolean handleVillagerChat(Player player, String message) {
        VillagerSessions.Session session = sessions.active(player.getUniqueId());
        if (session == null) {
            return false;
        }
        Optional<Persona> persona = Persona.find(personas, session.persona());
        if (persona.isEmpty()) {
            sessions.end(player.getUniqueId());
            return false;
        }
        sessions.refresh(player.getUniqueId());
        if (!cooldowns.tryAcquire(player.getUniqueId(), cooldownMillis())) {
            Msg.send(player, Msg.PREFIX + "§7" + persona.get().name() + " needs a moment…");
            return true;
        }
        // Echo the line privately: the public chat message is cancelled.
        Msg.send(player, "§f" + player.getName() + " §8» §6" + persona.get().name() + " §8» §7" + message);
        chatAsPersona(player, VillagerChatListener.villagerKey(session.villager(), player.getUniqueId()),
                persona.get(), message);
        return true;
    }

    /** Sets (or clears with null) the server API key at runtime and persists it to config.yml. */
    public void setApiKey(String key) {
        String trimmed = key == null || key.isBlank() ? null : key.trim();
        apiKey.set(trimmed);
        getConfig().set("apiKey", trimmed == null ? "" : trimmed);
        saveConfig();
    }

    // --- accessors shared by commands and listeners ---

    /** The async Pollinations API client. */
    public PollinationsClient client() {
        return client;
    }

    /** Conversation memory for /ai and villager chats. */
    public Conversations conversations() {
        return conversations;
    }

    /** Per-player request cooldowns (Pollen protection). */
    Cooldowns cooldowns() {
        return cooldowns;
    }

    /** Configured personas (villagers and /ai). */
    public List<Persona> personas() {
        return personas;
    }

    /** Default chat model from config. */
    public String chatModel() {
        return chatModel;
    }

    /** Default image model from config. */
    public String imageModel() {
        return imageModel;
    }

    /** Square image generation size from config. */
    public int maxImageSize() {
        return maxImageSize;
    }

    /** Per-player cooldown in milliseconds. */
    public long cooldownMillis() {
        return cooldownSeconds * 1000;
    }

    /** The server API key, or null when running anonymous. */
    public String apiKey() {
        return apiKey.get();
    }

    /** Name of the persona the player selected in /ai, or null. */
    public String selectedPersona(Player player) {
        return selectedPersona.get(player.getUniqueId());
    }

    /** Selects the /ai persona for a player. */
    public void selectPersona(Player player, String name) {
        selectedPersona.put(player.getUniqueId(), name);
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static long clamp(long value, long min, long max) {
        return Math.max(min, Math.min(max, value));
    }

    private static boolean hasClass(String name) {
        try {
            Class.forName(name, false, PollinationsPlugin.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }
}
