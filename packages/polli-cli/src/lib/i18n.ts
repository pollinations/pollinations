import i18next from "i18next";
import Backend from "i18next-fs-backend";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const resources = {
    en: {
        translation: {
            "cli.description": "The Pollinations CLI — for humans, AI agents, and everything in between",
            "cli.option.json": "Output as JSON",
            "cli.option.key": "Override stored API key for this command",
            "auth.login.success": "Authenticated. Key stored.",
            "auth.login.fallback": "Fallback: printf '%s' '<your-key>' | polli auth login --with-token",
            "auth.login.getkey": "Get your key at: https://enter.pollinations.ai",
            "auth.login.device": "Requesting device code...",
            "auth.login.code": "Your code: {code}",
            "auth.login.open": "Open this URL in your browser:",
            "auth.login.waiting": "Waiting for approval...",
            "auth.login.denied": "Access denied. You declined the authorization.",
            "auth.login.expired": "Code expired. Run `polli auth login` to try again.",
            "auth.login.failed": "Login failed: {reason}",
            "auth.logout.success": "Logged out. Credentials cleared.",
            "auth.status.not": "Not logged in. Run: polli auth login",
            "auth.status.key": "Key stored but could not reach API",
            "auth.status.name": "Logged in as {name}",
            "gen.generating": "Generating {type}...",
            "gen.generating.video": "Generating video (this can take up to 60s)...",
            "gen.saved": "Saved to {path}",
            "gen.playing": "Playing...",
            "gen.no_input": "No {type} provided. Pass as argument or pipe via stdin.",
            "gen.image.local": "--image requires a public http(s) URL, not a local path: {path}",
            "gen.audio.player_missing": "No mp3-capable player found. Install one of: ffmpeg (ffplay), mpv, or mpg123.",
            "error.insufficient": "Insufficient pollen balance.",
            "error.topup": "Top up: https://enter.pollinations.ai",
            "error.balance": "Account balance: {balance} pollen",
            "error.server": "Server said: {message}",
            "usage.balance": "pollen balance",
            "usage.history": "Usage history",
            "usage.daily": "Daily summary",
            "models.fetching": "Fetching models...",
            "models.stats": "Model health stats",
            "models.filter": "Filtered by type: {type}",
            "config.saved": "Configuration saved to {path}",
            "config.loaded": "Configuration loaded",
            "config.key": "Configuration key: {key} = {value}",
            "config.removed": "Configuration key removed",
            "upload.uploading": "Uploading {file}...",
            "upload.success": "Upload successful: {url}",
            "chat.session": "Chat session started (model: {model})",
            "chat.help": "Type /exit to quit, /clear to reset, /save <path> to save",
            "chat.saved": "Saved to {path}",
            "chat.ended": "Session ended. {tokens} tokens used.",
            "chat.cleared": "Conversation cleared.",
            "mcp.server_started": "MCP server started on {transport}",
        },
    },
    es: {
        translation: {
            "cli.description": "La CLI de Pollinations — para humanos, agentes de IA, y todo lo demás",
            "cli.option.json": "Salida en JSON",
            "cli.option.key": "Sobrescribir la clave API almacenada para este comando",
            "auth.login.success": "Autenticado. Clave almacenada.",
            "auth.login.fallback": "Alternativa: printf '%s' '<tu-clave>' | polli auth login --with-token",
            "auth.login.getkey": "Obtén tu clave en: https://enter.pollinations.ai",
            "auth.login.device": "Solicitando código de dispositivo...",
            "auth.login.code": "Tu código: {code}",
            "auth.login.open": "Abre esta URL en tu navegador:",
            "auth.login.waiting": "Esperando aprobación...",
            "auth.login.denied": "Acceso denegado. Rechazaste la autorización.",
            "auth.login.expired": "Código expirado. Ejecuta `polli auth login` para intentar de nuevo.",
            "auth.login.failed": "Error de inicio de sesión: {reason}",
            "auth.logout.success": "Sesión cerrada. Credenciales eliminadas.",
            "auth.status.not": "No has iniciado sesión. Ejecuta: polli auth login",
            "auth.status.key": "Clave almacenada pero no se pudo conectar con la API",
            "auth.status.name": "Sesión iniciada como {name}",
            "gen.generating": "Generando {type}...",
            "gen.generating.video": "Generando video (esto puede tomar hasta 60s)...",
            "gen.saved": "Guardado en {path}",
            "gen.playing": "Reproduciendo...",
            "gen.no_input": "No se proporcionó {type}. Pásalo como argumento o mediante stdin.",
            "gen.image.local": "--image requiere una URL http(s) pública, no una ruta local: {path}",
            "gen.audio.player_missing": "No se encontró un reproductor de mp3. Instala uno de: ffmpeg (ffplay), mpv, o mpg123.",
            "error.insufficient": "Saldo de pollen insuficiente.",
            "error.topup": "Recarga en: https://enter.pollinations.ai",
            "error.balance": "Saldo de la cuenta: {balance} pollen",
            "error.server": "El servidor dijo: {message}",
            "usage.balance": "saldo de pollen",
            "usage.history": "Historial de uso",
            "usage.daily": "Resumen diario",
            "models.fetching": "Obteniendo modelos...",
            "models.stats": "Estadísticas de salud de modelos",
            "models.filter": "Filtrados por tipo: {type}",
            "config.saved": "Configuración guardada en {path}",
            "config.loaded": "Configuración cargada",
            "config.key": "Clave de configuración: {key} = {value}",
            "config.removed": "Clave de configuración eliminada",
            "upload.uploading": "Subiendo {file}...",
            "upload.success": "Subida exitosa: {url}",
            "chat.session": "Sesión de chat iniciada (modelo: {model})",
            "chat.help": "Escribe /exit para salir, /clear para reiniciar, /save <ruta> para guardar",
            "chat.saved": "Guardado en {path}",
            "chat.ended": "Sesión finalizada. {tokens} tokens usados.",
            "chat.cleared": "Conversación reiniciada.",
            "mcp.server_started": "Servidor MCP iniciado en {transport}",
        },
    },
};

let i18nInitialized = false;

export async function initI18n(locale = "en") {
    if (i18nInitialized) return;
    await i18next.use(Backend).init({
        lng: locale,
        fallbackLng: "en",
        resources,
        interpolation: { escapeValue: false },
    });
    i18nInitialized = true;
}

export function t(key: string, params?: Record<string, string | number>): string {
    return i18next.t(key, params);
}

export function setLocale(locale: string) {
    i18next.changeLanguage(locale);
}