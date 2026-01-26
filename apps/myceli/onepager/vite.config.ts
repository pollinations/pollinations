import path from 'node:path';
import { defineConfig } from 'vite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      {
        name: 'spa-fallback',
        closeBundle() {
          if (fs.existsSync('./dist/index.html')) {
            fs.copyFileSync('./dist/index.html', './dist/404.html');
            console.log('✅ Copied index.html to 404.html for Cloudflare Pages SPA support');
          }
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
