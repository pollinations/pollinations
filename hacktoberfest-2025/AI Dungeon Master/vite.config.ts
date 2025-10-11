import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/text': {
        target: 'https://text.pollinations.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/text/, ''),
      },
      '/api/image': {
        target: 'https://image.pollinations.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/image/, ''),
      },
    },
  },
})
