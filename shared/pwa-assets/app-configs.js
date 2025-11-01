/**
 * Per-app PWA asset configuration
 * Allows customization of source assets, colors, and icon-specific overrides
 */

export const APP_CONFIGS = {
  enter: {
    name: 'enter.pollinations.ai',
    outputDir: 'enter.pollinations.ai/public',
    
    // SOURCE ASSETS (from /assets/ - single source of truth)
    sourceSvg: '../../assets/logo.svg',
    ogSourceSvg: '../../assets/logo-text.svg',
    logoColor: 'white',  // Color applied during generation
    themeColor: '#5b2dd8',  // Darker purple theme
    backgroundColor: '#5b2dd8',
    
    // SEO / META TAGS (Single Source of Truth)
    seo: {
      title: 'pollinations.ai - beta',
      description: 'authentication and API gateway for pollinations.ai',
      url: 'https://enter.pollinations.ai',
    },
    
    // Per-icon-type customization
    icons: {
      favicons: {
        background: '#5b2dd8'  // Purple background (logo already white)
      },
      pwa: {
        background: '#7a3cff'
      },
      apple: {
        background: '#7a3cff'
      },
      maskable: {
        background: '#7a3cff'
      },
      og: {
        background: '#7a3cff'
      }
    }
  },
  
  pollinations: {
    name: 'pollinations.ai',
    outputDir: 'pollinations.ai/public',
    
    // SOURCE ASSETS (from /assets/ - single source of truth)
    sourceSvg: '../../assets/logo.svg',
    ogSourceSvg: '../../assets/logo-text.svg',
    logoColor: 'white',  // Color applied during generation
    themeColor: '#d6379e',  // Darker pink/magenta theme
    backgroundColor: '#d6379e',
    
    // SEO / META TAGS (Single Source of Truth)
    seo: {
      title: 'pollinations.ai',
      description: 'Free 🐝 Open Source 🌸 Gen AI 🤖 API',
      url: 'https://pollinations.ai',
    },
    
    icons: {
      favicons: {
        background: '#d6379e'  // Magenta background (logo already white)
      },
      pwa: {
        background: '#ff61d8'
      },
      apple: {
        background: '#ff61d8'
      },
      maskable: {
        background: '#ff61d8'
      },
      og: {
        background: '#ff61d8'
      }
    }
  },
  
  auth: {
    name: 'auth.pollinations.ai',
    outputDir: 'auth.pollinations.ai/media',
    
    // SOURCE ASSETS (from /assets/ - single source of truth)
    sourceSvg: '../../assets/logo.svg',
    logoColor: 'white',  // Color applied during generation
    themeColor: '#e67e00',  // Darker orange theme
    backgroundColor: '#e67e00',
    
    icons: {
      favicons: {
        background: '#e67e00'  // Orange background (logo already white)
      },
      pwa: {
        background: '#ffb300'
      },
      apple: {
        background: '#ffb300'
      },
      maskable: {
        background: '#ffb300'
      }
    }
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
