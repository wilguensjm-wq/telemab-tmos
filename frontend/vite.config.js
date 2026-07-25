import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendProxyTarget = process.env.TMOS_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8081'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "TMOS_"],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: backendProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
