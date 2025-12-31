import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "lexica_theme_mode";

export class ThemeService {
    static async getThemeMode(): Promise<ThemeMode> {
        try {
            const savedTheme = await AsyncStorage.getItem(THEME_KEY);
            return (savedTheme as ThemeMode) || "dark"; // Default to dark mode
        } catch (error) {
            console.error("Error getting theme mode:", error);
            return "dark"; // Default fallback
        }
    }

    static async setThemeMode(mode: ThemeMode): Promise<void> {
        try {
            await AsyncStorage.setItem(THEME_KEY, mode);
        } catch (error) {
            console.error("Error setting theme mode:", error);
            throw error;
        }
    }
}
