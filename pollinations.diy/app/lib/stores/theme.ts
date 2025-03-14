import { atom } from 'nanostores';
import { logStore } from './logs';

export type Theme = 'dark';

export const kTheme = 'bolt_theme';

export function themeIsDark() {
  return true;
}

export const DEFAULT_THEME = 'dark';

export const themeStore = atom<Theme>('dark');

function initStore(): Theme {
  return 'dark';
}

export function toggleTheme() {
  // Do nothing - we're enforcing dark mode
  return;
}
