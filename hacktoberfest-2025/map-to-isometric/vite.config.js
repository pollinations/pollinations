import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configure base URL to match the subdirectory where the app is served
export default defineConfig({
  plugins: [react()],
  base: '',
})