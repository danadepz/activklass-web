import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Bind to all interfaces so devices on the network can reach the dev
    // server, not just this machine's own browser.
    host: true,
    // Same-origin /api so a forwarded port works for remote viewers: their
    // browser cannot reach our localhost:5000, but it can reach this server.
    proxy: {
      '/api': 'http://localhost:5000',
    },
    // VS Code port forwarding serves from *.devtunnels.ms; without this Vite
    // rejects the Host header and the page renders "Blocked request".
    allowedHosts: ['.devtunnels.ms', '.trycloudflare.com'],
  },
})
