/**
 * Simplified PWA asset configuration
 * Just theme colors and output directories
 */

export const APP_CONFIGS = {
  enter: {
    name: 'enter.pollinations.ai',
    outputDir: 'enter.pollinations.ai/public',
    sourceSvg: '../../assets/logo.svg',
    ogSourceSvg: '../../assets/logo-text.svg',
    themeColor: '#5b2dd8',
    seo: {
      title: 'pollinations.ai - beta',
      description: 'authentication and API gateway for pollinations.ai',
      url: 'https://enter.pollinations.ai',
    }
  },
  
  pollinations: {
    name: 'pollinations.ai',
    outputDir: 'pollinations.ai/public',
    sourceSvg: '../../assets/logo.svg',
    ogSourceSvg: '../../assets/logo-text.svg',
    themeColor: '#d6379e',
    seo: {
      title: 'pollinations.ai',
      description: 'Free 🐝 Open Source 🌸 Gen AI 🤖 API',
      url: 'https://pollinations.ai',
    }
  },
  
  auth: {
    name: 'auth.pollinations.ai',
    outputDir: 'auth.pollinations.ai/media',
    sourceSvg: '../../assets/logo.svg',
    themeColor: '#e67e00'
  }
};

/**
 * Helper to resolve background color
 * Supports: 'transparent', hex colors, or {r, g, b, alpha} objects
 */
export function resolveBackground(bgConfig) {
  if (bgConfig === 'transparent') {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }
  
  if (typeof bgConfig === 'string' && bgConfig.startsWith('#')) {
    // Convert hex to RGB
    const hex = bgConfig.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b, alpha: 1 };
  }
  
  return bgConfig;
}
