import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const getEnvValue = (source, keys) => {
    for (const key of keys) {
      if (source[key]) return source[key]
    }
    const wanted = new Set(keys.map((k) => k.toLowerCase()))
    for (const [k, v] of Object.entries(source)) {
      if (v && wanted.has(k.toLowerCase())) return v
    }
    return ''
  }

  const getRuntimeEnvValue = (keys) =>
    getEnvValue(process.env, keys) || getEnvValue(env, keys)

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const anthropicKey = getRuntimeEnvValue(['ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'])
              if (!anthropicKey) return
              if (!proxyReq.getHeader('x-api-key')) proxyReq.setHeader('x-api-key', anthropicKey)
            })
          },
        },
        '/api/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const openaiKey = getRuntimeEnvValue(['OPENAI_API_KEY', 'VITE_OPENAI_API_KEY', 'OPENAI_KEY'])
              if (!openaiKey) return
              if (!proxyReq.getHeader('authorization')) proxyReq.setHeader('authorization', `Bearer ${openaiKey}`)
            })
          },
        },
      },
    },
  }
})
