import { createServer, type ViteDevServer } from 'vite'

const g = globalThis as Record<string, unknown>
g.document ??= { documentElement: {}, title: '', cookie: '' }

let server: ViteDevServer | null = null

export async function load<T = Record<string, unknown>>(path: string): Promise<T> {
  server ??= await createServer({
    root: new URL('../..', import.meta.url).pathname,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  })
  return (await server.ssrLoadModule(path)) as T
}

export async function close() {
  await server?.close()
  server = null
}
