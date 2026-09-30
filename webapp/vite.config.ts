import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import { MockAppsScriptService } from './src/dev/mockAppsScript.ts'

const mockService = new MockAppsScriptService()

function devMockAppsScriptPlugin(): Plugin {
  return {
    name: 'dev-mock-appsscript',
    configureServer(server) {
      server.middlewares.use('/__mock-appsscript__', (req, res) => {
        if ((req.method ?? 'GET').toUpperCase() === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, data: { status: 'ok' } }))
          return
        }

        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          try {
            const envelope = JSON.parse(body)
            const response = mockService.handleEnvelope(envelope)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(response))
          } catch (error) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: false,
                error: {
                  code: 'validation',
                  message:
                    error instanceof Error ? error.message : 'Invalid mock request',
                },
              }),
            )
          }
        })
      })
    },
  }
}

const packageJson = JSON.parse(
  readFileSync(join(import.meta.dirname, 'package.json'), 'utf8'),
) as { version: string }

export default defineConfig(({ command }) => ({
  base:
    process.env.VITE_BASE_PATH ??
    (command === 'serve' ? '/' : '/lbrx-language-flash-card/'),
  plugins: [
    react(),
    devMockAppsScriptPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg', 'pwa-maskable.svg'],
      manifest: {
        id: '/lbrx-language-flash-card/',
        name: 'LBRX Language Flash Cards',
        short_name: 'LBRX Cards',
        description: 'Local-first multi-user language flash cards with offline sync.',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
}))
