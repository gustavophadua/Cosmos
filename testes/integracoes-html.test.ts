import { createServer, request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { criarPaginaLocal } from '../src/integracoes/html-local-node'

describe('M12: HTML local com CSP de conexão, sem restringir scripts/WASM', () => {
  it('envia a diretiva exata no HTML e mantém a ponte e as recusas', async () => {
    const html = Buffer.from('<!doctype html><title>Cosmos</title><script>/* WASM permitido pela CSP */</script>')
    let tratar: ReturnType<typeof criarPaginaLocal>
    const server = createServer((req, res) => tratar(req, res))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const porta = (server.address() as { port: number }).port
    const origem = `http://127.0.0.1:${porta}`
    tratar = criarPaginaLocal({ origem, html, ponte: (_req, res) => { res.writeHead(401); res.end('sessao exigida') } })
    const chamar = (path: string, method = 'GET', host = `127.0.0.1:${porta}`) => new Promise<{ status: number; csp?: string; body: string }>((resolve, reject) => {
      const q = request({ hostname: '127.0.0.1', port: porta, path, method, headers: { Host: host }, agent: false }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', s => { body += s }); res.on('end', () => resolve({ status: res.statusCode!, csp: res.headers['content-security-policy'] as string | undefined, body }))
      }); q.on('error', reject); q.end()
    })
    try {
      for (const path of ['/', '/cosmos/', '/cosmos/index.html']) {
        const r = await chamar(path)
        expect(r.status).toBe(200); expect(r.body).toBe(html.toString())
        expect(r.csp).toBe("connect-src 'self'"); expect(r.csp).not.toContain('script-src')
      }
      expect((await chamar('/cosmos/__p0/ollama')).status).toBe(401)
      expect((await chamar('/cosmos/', 'POST')).status).toBe(404)
      expect((await chamar('/cosmos/?externo=1')).status).toBe(404)
      expect((await chamar('/cosmos/', 'GET', 'localhost')).status).toBe(403)
    } finally { await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections() }) }
  })
  it('recusa origem pública, DNS e porta inválida', () => {
    for (const origem of ['https://cosmos.example', 'http://localhost:4175', 'http://127.0.0.1:99999']) {
      expect(() => criarPaginaLocal({ origem, html: Buffer.from(''), ponte: () => undefined })).toThrow()
    }
  })
})
