import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { execSync } from 'child_process'

const backendProxyTarget = process.env.TMOS_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8081'
const liveKitProxyTarget = process.env.TMOS_LIVEKIT_PROXY_TARGET || 'http://127.0.0.1:7880'
const useHttps = process.env.TMOS_DEV_HTTPS === 'true'

function buildVersion() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const hhmm = now.toISOString().slice(11, 16).replace(':', '')
  let hash = 'local'
  try {
    hash = execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    // not in a git repo or git unavailable
  }
  return `${date}.${hhmm}.${hash}`
}

const BUILD_VERSION = buildVersion()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  envPrefix: ["VITE_", "TMOS_"],
  server: {
    host: '0.0.0.0',
    https: useHttps,
    proxy: {
      '/api': {
        target: backendProxyTarget,
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: liveKitProxyTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },
})
