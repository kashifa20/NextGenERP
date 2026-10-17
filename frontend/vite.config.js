import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000'
const apiPaths = '^/(auth|products|categories|suppliers|orders|purchase-orders|inventory-transactions|health)(/.*)?$'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      [apiPaths]: {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
