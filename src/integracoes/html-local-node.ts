import type { RequestListener } from 'node:http'

/** HTML da instância local compilada; sem HMR nem política de script adicional.
 * connect-src restringe conexões da página, não imagens, navegação ou o processo Node.
 */
export function criarPaginaLocal(o: { origem: string; html: Uint8Array; ponte: RequestListener }): RequestListener {
  const u = new URL(o.origem)
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(o.origem) || u.origin !== o.origem || Number(u.port) > 65535) throw new Error('Origem local inválida')
  return (req, res) => {
    if (req.url?.startsWith('/cosmos/__p0/')) { o.ponte(req, res); return }
    const hosts = req.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === 'host').length
    if (req.socket.remoteAddress !== '127.0.0.1' || hosts !== 1 || req.headers.host !== u.host) { res.writeHead(403); res.end(); return }
    if (req.method !== 'GET' || !['/', '/cosmos/', '/cosmos/index.html'].includes(req.url ?? '')) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "connect-src 'self'" })
    res.end(o.html)
  }
}
