import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import chatApiPlugin from './vite-chat-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), chatApiPlugin()],
})
