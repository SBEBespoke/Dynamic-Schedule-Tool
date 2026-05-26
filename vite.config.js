import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Set VITE_BASE_PATH in your GitHub repo secrets to match your repo name.
// e.g. if your repo is github.com/you/dynamic-schedule-tool, set it to /dynamic-schedule-tool/
// Leave blank (or set to /) for a custom domain or local dev.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
