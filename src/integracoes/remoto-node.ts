import { createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { request, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http'
import { join } from 'node:path'

/**
 * O Cosmos aberto de fora (do telefone, por um túnel até este computador), com login de uma conta só: a dona.
 *
 * A porta remota fica na frente da ponte local, que não muda: quem passa pelo login tem o pedido refeito para a ponte
 * interna, com os cabeçalhos que ela exige e um segredo que só este processo conhece (outro programa do computador não
 * chega à IA sem ele). Do pedido de fora só passam os cabeçalhos da lista; cookie, Forwarded e os da Cloudflare ficam.
 *
 * - Senha: scrypt (N = 2^15), criada no próprio computador (`--definir-senha`); não há cadastro pela rede.
 * - Sessão: cookie `__Host-` (Secure, HttpOnly, SameSite=Strict), 12 horas parada ou 7 dias no total, só na memória.
 * - Tentativas: 5 erradas em 15 minutos bloqueiam o login até a mais antiga sair da janela.
 * - Histórico da Conversa: no computador, cifrado (AES-256-GCM) com uma chave tirada da senha no login. A chave só
 *   existe na memória enquanto há sessão viva; sem ela, os arquivos não se leem.
 * A conta cifrada do aparelho e a carteira de teste continuam só no modo local (127.0.0.1).
 */

export interface ContaRemota { formato: 'cosmos-remoto-conta-v1'; sal: string; hash: string; salDados: string; criadaEm: string }
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const derivar = (senha: string, sal: Buffer) => new Promise<Buffer>((ok, falha) => scrypt(senha.normalize('NFC'), sal, 32, SCRYPT, (e, k) => e ? falha(e) : ok(k)))
const hex = (s: unknown, bytes: number): s is string => typeof s === 'string' && new RegExp(`^[a-f0-9]{${bytes * 2}}$`).test(s)

export async function criarContaRemota(senha: string): Promise<ContaRemota> {
  if (senha.length < 12 || senha.length > 256) throw new Error('A senha precisa ter de 12 a 256 caracteres')
  const sal = randomBytes(16)
  return { formato: 'cosmos-remoto-conta-v1', sal: sal.toString('hex'), hash: (await derivar(senha, sal)).toString('hex'), salDados: randomBytes(16).toString('hex'), criadaEm: new Date().toISOString() }
}
export function lerContaRemota(x: unknown): ContaRemota {
  const c = x as ContaRemota
  if (typeof x !== 'object' || x === null || c.formato !== 'cosmos-remoto-conta-v1' || !hex(c.sal, 16) || !hex(c.hash, 32) || !hex(c.salDados, 16)) throw new Error('Conta remota inválida')
  return c
}

/** A ponte interna só atende quem traz o segredo deste processo (a porta remota). */
export function exigirSegredo(segredo: string, tratar: RequestListener): RequestListener {
  if (!hex(segredo, 32)) throw new Error('Segredo inválido')
  const esperado = Buffer.from(segredo)
  return (req, res) => {
    const h = req.headers['x-cosmos-interno']
    if (typeof h !== 'string' || h.length !== esperado.length || !timingSafeEqual(Buffer.from(h), esperado)) { res.writeHead(403); res.end(); return }
    tratar(req, res)
  }
}

export const CHAVE_DADO = /^(?:ia-indice|ia-relatos|ia-msg-[1-9][0-9]{0,8})$/
const COOKIE = '__Host-cosmos'
const OCIOSO_MS = 12 * 3600_000, MAXIMO_MS = 7 * 24 * 3600_000, JANELA_MS = 15 * 60_000, TENTATIVAS = 5
// só estes cabeçalhos do pedido de fora chegam à ponte (o resto, cookie e Forwarded inclusive, fica aqui)
const REPASSADOS = ['accept', 'content-type', 'content-length', 'x-cosmos-p0', 'x-cosmos-sessao']

export interface OpcoesPortaRemota {
  conta: ContaRemota
  /** O HTML do Cosmos (a página única, sem service worker). */
  html: Uint8Array
  /** A ponte interna: a porta em 127.0.0.1 e o segredo que ela exige. */
  interno: { porta: number; segredo: string }
  /** Os endereços aceitos no Host: o do túnel e o local (127.0.0.1:porta), para abrir no próprio computador. */
  hosts: () => readonly string[]
  pastaDados: string
  agora?: () => number
}

export function criarPortaRemota(o: OpcoesPortaRemota): RequestListener & { encerrar(): void } {
  const conta = lerContaRemota(o.conta), agora = o.agora ?? Date.now
  const sessoes = new Map<string, { criada: number; ultimo: number }>()
  let falhas: number[] = [], chaveDados: Buffer | null = null
  const html = Buffer.from(Buffer.from(o.html).toString('utf8').replace('<head>', '<head><meta name="cosmos-remoto" content="1">'))
  mkdirSync(o.pastaDados, { recursive: true })

  const limpar = () => {
    const t = agora()
    for (const [k, s] of sessoes) if (t - s.ultimo >= OCIOSO_MS || t - s.criada >= MAXIMO_MS) sessoes.delete(k)
    // sem nenhuma sessão viva, a chave do histórico sai da memória
    if (!sessoes.size && chaveDados) { chaveDados.fill(0); chaveDados = null }
    falhas = falhas.filter((f) => t - f < JANELA_MS)
  }
  const origemDe = (host: string) => (/^127\.0\.0\.1:\d+$/.test(host) ? `http://${host}` : `https://${host}`)
  const cabecalhos = (host: string, extra: Record<string, string | string[]> = {}) => ({
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    ...(origemDe(host).startsWith('https:') ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), ...extra,
  })
  const cookieDe = (req: IncomingMessage) => {
    const c = req.headers.cookie
    if (typeof c !== 'string') return null
    for (const parte of c.split(';')) {
      const [nome, ...valor] = parte.trim().split('=')
      if (nome === COOKIE) return valor.join('=')
    }
    return null
  }
  const sessaoDe = (req: IncomingMessage) => {
    const t = cookieDe(req)
    if (!t || !hex(t, 32)) return null
    const s = sessoes.get(t)
    if (!s) return null
    s.ultimo = agora()
    return t
  }
  const lerCorpo = (req: IncomingMessage, limite: number) => new Promise<Buffer>((ok, falha) => {
    const partes: Buffer[] = []; let n = 0
    req.on('data', (b: Buffer) => { n += b.length; if (n > limite) { falha(new Error('grande')); req.destroy() } else partes.push(b) })
    req.once('end', () => ok(Buffer.concat(partes)))
    req.once('error', falha)
  })
  const ir = (res: ServerResponse, host: string, para: string, extra: Record<string, string | string[]> = {}) => { res.writeHead(303, cabecalhos(host, { Location: para, ...extra })); res.end() }
  const json = (res: ServerResponse, host: string, status: number, corpo: unknown) => { res.writeHead(status, cabecalhos(host, { 'Content-Type': 'application/json; charset=utf-8' })); res.end(JSON.stringify(corpo)) }

  // o histórico: um arquivo por chave, cifrado; a chave do arquivo entra como dado associado (não se troca um pelo outro)
  const arquivo = (chave: string) => join(o.pastaDados, `${chave}.json`)
  const lerDado = (chave: string): unknown => {
    if (!existsSync(arquivo(chave))) return null
    const d = JSON.parse(readFileSync(arquivo(chave), 'utf8')) as { formato: string; iv: string; tag: string; dados: string }
    if (d.formato !== 'cosmos-remoto-dado-v1') throw new Error('formato')
    const decifra = createDecipheriv('aes-256-gcm', chaveDados!, Buffer.from(d.iv, 'hex'))
    decifra.setAAD(Buffer.from(chave)); decifra.setAuthTag(Buffer.from(d.tag, 'hex'))
    return JSON.parse(Buffer.concat([decifra.update(Buffer.from(d.dados, 'base64')), decifra.final()]).toString('utf8'))
  }
  const gravarDado = (chave: string, valor: unknown) => {
    const iv = randomBytes(12), cifra = createCipheriv('aes-256-gcm', chaveDados!, iv)
    cifra.setAAD(Buffer.from(chave))
    const dados = Buffer.concat([cifra.update(JSON.stringify(valor), 'utf8'), cifra.final()])
    const temporario = `${arquivo(chave)}.${randomBytes(4).toString('hex')}.tmp`
    writeFileSync(temporario, JSON.stringify({ formato: 'cosmos-remoto-dado-v1', iv: iv.toString('hex'), tag: cifra.getAuthTag().toString('hex'), dados: dados.toString('base64') }))
    renameSync(temporario, arquivo(chave))
  }

  const paginaEntrar = (aviso: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cosmos · entrar</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f6f6f4;color:#1d1d1b}
main{width:min(360px,calc(100% - 32px))}h1{font-size:24px;margin:0 0 4px}p{margin:0 0 20px;color:#5c5c58}label{display:block;font-weight:600;margin-bottom:6px}
input{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #c9c9c4;border-radius:8px;background:#fff;color:inherit}
button{margin-top:12px;width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:8px;background:#1d1d1b;color:#fff}
.aviso{color:#a12a2a;margin:12px 0 0}@media (prefers-color-scheme:dark){body{background:#151514;color:#ecece8}p{color:#a5a5a0}input{background:#20201e;border-color:#3a3a37}button{background:#ecece8;color:#151514}.aviso{color:#f08a8a}}</style></head>
<body><main><h1>Cosmos</h1><p>Entre com a senha da conta dona para usar a Conversa deste computador.</p>
<form method="post" action="/cosmos/entrar"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required minlength="12" maxlength="256" autofocus>
<button type="submit">Entrar</button>${aviso ? `<p class="aviso" role="alert">${aviso}</p>` : ''}</form></main></body></html>`
  const CSP_ENTRAR = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"

  const repassar = (req: IncomingMessage, res: ServerResponse, host: string) => {
    const interno = `127.0.0.1:${o.interno.porta}`
    const headers: Record<string, string> = { host: interno, 'x-cosmos-interno': o.interno.segredo }
    for (const h of REPASSADOS) { const v = req.headers[h]; if (typeof v === 'string') headers[h] = v }
    // a ponte confere a origem: o pedido de fora vem da origem pública, que aqui vira a interna
    if (req.headers.origin === origemDe(host)) headers.origin = `http://${interno}`
    if (req.headers['sec-fetch-site'] === 'same-origin') { headers['sec-fetch-site'] = 'same-origin'; headers.referer = `http://${interno}/cosmos/` }
    const proxy = request({ hostname: '127.0.0.1', port: o.interno.porta, path: req.url, method: req.method, headers, agent: false, maxHeaderSize: 8192 }, (resposta) => {
      const tipo = resposta.headers['content-type']
      res.writeHead(resposta.statusCode ?? 503, cabecalhos(host, typeof tipo === 'string' ? { 'Content-Type': tipo } : {}))
      resposta.pipe(res)
      resposta.once('error', () => res.destroy())
    })
    proxy.setTimeout(11 * 60_000, () => proxy.destroy())
    proxy.once('error', () => { if (!res.headersSent) json(res, host, 503, { erro: 'ponte_local_indisponivel' }); else res.destroy() })
    req.pipe(proxy)
    res.once('close', () => proxy.destroy())
  }

  const tratar: RequestListener = (req, res) => {
    void (async () => {
      const hosts = req.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === 'host').length
      const host = req.headers.host ?? ''
      if (hosts !== 1 || !o.hosts().includes(host)) { res.writeHead(421, { 'Cache-Control': 'no-store' }); res.end(); return }
      limpar()
      const url = new URL(req.url ?? '/', origemDe(host)), caminho = url.pathname
      // pedido que muda algo: só da própria origem (o cookie SameSite=Strict já barra os outros sites; isto é a segunda tranca)
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const site = req.headers['sec-fetch-site']
        if (req.headers.origin !== origemDe(host) || (site !== undefined && site !== 'same-origin')) { json(res, host, 403, { erro: 'origem' }); return }
      }
      if (caminho === '/' && req.method === 'GET') { ir(res, host, '/cosmos/#/i-ai'); return }
      if (caminho === '/cosmos/entrar') {
        if (req.method === 'GET') {
          const aviso = url.searchParams.get('erro') === 'senha' ? 'Senha errada.' : url.searchParams.get('erro') === 'espera' ? 'Muitas tentativas. Espere 15 minutos e tente de novo.' : ''
          res.writeHead(200, cabecalhos(host, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_ENTRAR }))
          res.end(paginaEntrar(aviso)); return
        }
        if (req.method !== 'POST') { res.writeHead(405, cabecalhos(host)); res.end(); return }
        if (falhas.length >= TENTATIVAS) { ir(res, host, '/cosmos/entrar?erro=espera'); return }
        let senha = ''
        try { senha = new URLSearchParams((await lerCorpo(req, 2048)).toString('utf8')).get('senha') ?? '' } catch { res.writeHead(413, cabecalhos(host)); res.end(); return }
        const tentativa = senha.length >= 12 && senha.length <= 256 ? await derivar(senha, Buffer.from(conta.sal, 'hex')) : randomBytes(32)
        if (!timingSafeEqual(tentativa, Buffer.from(conta.hash, 'hex'))) {
          falhas.push(agora()); senha = ''
          ir(res, host, `/cosmos/entrar?erro=${falhas.length >= TENTATIVAS ? 'espera' : 'senha'}`); return
        }
        falhas = []
        if (!chaveDados) chaveDados = await derivar(senha, Buffer.from(conta.salDados, 'hex'))
        senha = ''
        while (sessoes.size >= 10) sessoes.delete(sessoes.keys().next().value!)
        const token = randomBytes(32).toString('hex'), t = agora()
        sessoes.set(token, { criada: t, ultimo: t })
        ir(res, host, '/cosmos/#/i-ai', { 'Set-Cookie': `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${MAXIMO_MS / 1000}` })
        return
      }
      const token = sessaoDe(req)
      if (caminho === '/cosmos/sair' && req.method === 'POST') {
        if (token) sessoes.delete(token)
        limpar()
        ir(res, host, '/cosmos/entrar', { 'Set-Cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0` }); return
      }
      const api = caminho.startsWith('/cosmos/__p0/') || caminho.startsWith('/cosmos/__remoto/')
      if (!token) {
        if (api) json(res, host, 401, { erro: 'login' })
        else if (req.method === 'GET' && (caminho === '/cosmos/' || caminho === '/cosmos/index.html')) ir(res, host, '/cosmos/entrar')
        else { res.writeHead(404, cabecalhos(host)); res.end() }
        return
      }
      if (req.method === 'GET' && (caminho === '/cosmos/' || caminho === '/cosmos/index.html')) {
        res.writeHead(200, cabecalhos(host, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "connect-src 'self'; frame-ancestors 'none'" }))
        res.end(html); return
      }
      if (caminho.startsWith('/cosmos/__p0/')) { repassar(req, res, host); return }
      const dado = /^\/cosmos\/__remoto\/dados\/([a-z0-9-]{1,32})$/.exec(caminho)
      if (dado && CHAVE_DADO.test(dado[1]) && chaveDados && req.headers['x-cosmos-remoto'] === '1') {
        try {
          if (req.method === 'GET') { json(res, host, 200, { valor: lerDado(dado[1]) }); return }
          if (req.method === 'PUT' && /^application\/json/i.test(req.headers['content-type'] ?? '')) {
            const corpo = JSON.parse((await lerCorpo(req, 262_144)).toString('utf8')) as { valor?: unknown }
            if (typeof corpo !== 'object' || corpo === null || !('valor' in corpo)) { json(res, host, 400, { erro: 'invalido' }); return }
            gravarDado(dado[1], corpo.valor); json(res, host, 200, { ok: true }); return
          }
          res.writeHead(405, cabecalhos(host)); res.end(); return
        } catch { json(res, host, 400, { erro: 'invalido' }); return }
      }
      res.writeHead(404, cabecalhos(host)); res.end()
    })().catch(() => { if (!res.headersSent) { res.writeHead(400, { 'Cache-Control': 'no-store' }); res.end() } else res.destroy() })
  }
  return Object.assign(tratar, { encerrar() { sessoes.clear(); if (chaveDados) { chaveDados.fill(0); chaveDados = null } } })
}
