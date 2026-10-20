import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'API_PROXY_')
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:3000'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: { '/deals': target, '/deal': target },
    },
  }
})
