import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ThemeMode, ThemeService } from '../services/ThemeService';

// export const lightTheme = {
//   mode: 'light' as ThemeMode,
//   colors: {
//     background: '#FFFFFF',
//     surface: '#FFFFFF',
//     card: '#F2F2F7',
//     border: '#E5E5EA',
//     text: '#1C1C1E',
//     textSecondary: '#8E8E93',
//     textTertiary: '#C7C7CC',
//     primary: '#007AFF',
//     secondary : '#3ade97',
//     success: '#34C759',
//     warning: '#FF9500',
//     error: '#FF3B30',
//     tabBarBackground: '#FFFFFF',
//     tabBarBorder: '#E5E5EA',
//     headerBackground: '#FFFFFF',
//     inputBackground: '#FAFAFA',
//     inputBorder: '#E5E5EA',
//     shadow: 'rgba(0, 0, 0, 0.1)',
//     overlay: 'rgba(0, 0, 0, 0.5)',
//   }
// };

export const lightTheme = {
  mode: 'light' as ThemeMode,
  colors: {
    background: '#F9FFFC',          // blanc légèrement teinté de vert menthe
    surface: '#FFFFFF',
    card: '#F0FBF7',                // vert menthe très clair
    border: '#D6F5E7',              // vert pâle pour délimiter sans contraste fort
    text: '#1C1C1E',
    textSecondary: '#6C757D',
    textTertiary: '#A1A8B0',

    primary: '#35D89A',             // ton vert menthe principal (cohérent avec logo)
    secondary: '#20CFC0',           // turquoise clair pour les accents
    success: '#34C759',
    warning: '#FFB020',
    error: '#FF3B30',

    tabBarBackground: '#FFFFFF',
    tabBarBorder: '#D6F5E7',
    headerBackground: '#F9FFFC',
    inputBackground: '#F4FFFA',
    inputBorder: '#D6F5E7',

    shadow: 'rgba(0, 0, 0, 0.08)',
    overlay: 'rgba(0, 0, 0, 0.4)',
  }
};


export const darkTheme = {
  mode: 'dark' as ThemeMode,
  colors: {
    background: '#0D0D0D',
    surface: '#1A1A1A',
    card: '#222222',
    border: '#333333',
    text: '#F2F2F2',
    textSecondary: '#A1A1AA',
    textTertiary: '#666666',
    primary: '#D4D4D8',
    secondary : '#3ade97',
    success: '#6F6F6F',
    warning: '#7A7A7A',
    error: '#EF4444',
    tabBarBackground: '#1A1A1A',
    tabBarBorder: '#2A2A2A',
    headerBackground: '#1A1A1A',
    inputBackground: '#222222',
    inputBorder: '#333333',
    shadow: 'rgba(0, 0, 0, 0.5)',
    overlay: 'rgba(0, 0, 0, 0.7)',
  }
};

export type Theme = typeof lightTheme;

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await ThemeService.getThemeMode();
      setThemeModeState(savedTheme);
    } catch (error) {
      console.error('Error loading theme:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      await ThemeService.setThemeMode(mode);
      setThemeModeState(mode);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const toggleTheme = () => {
    const newMode = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(newMode);
  };

  const theme = themeMode === 'light' ? lightTheme : darkTheme;
  const isDark = themeMode === 'dark';

  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}