import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http'
import { mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { criarContaRemota, criarPortaRemota, exigirSegredo } from '../src/integracoes/remoto-node'

const SENHA = 'uma senha de teste comprida'
let porta: number, servidor: Server, interno: Server, pasta: string, recebidos: { url?: string; headers: IncomingHttpHeaders }[] = []
const segredo = randomBytes(32).toString('hex')
const host = () => `127.0.0.1:${porta}`, origem = () => `http://${host()}`

function pedir(caminho: string, o: { method?: string; headers?: Record<string, string>; corpo?: string } = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; corpo: string }>((ok, falha) => {
    const r = request({ hostname: '127.0.0.1', port: porta, path: caminho, method: o.method ?? 'GET', headers: { host: host(), ...o.headers } }, (res) => {
      let corpo = ''; res.setEncoding('utf8'); res.on('data', (c) => { corpo += c }); res.on('end', () => ok({ status: res.statusCode!, headers: res.headers, corpo }))
    })
    r.on('error', falha); r.end(o.corpo)
  })
}
const entrar = (senha: string) => pedir('/cosmos/entrar', { method: 'POST', headers: { origin: origem(), 'content-type': 'application/x-www-form-urlencoded' }, corpo: new URLSearchParams({ senha }).toString() })
const cookie = (h: IncomingHttpHeaders) => (h['set-cookie'] ?? [])[0]?.split(';')[0] ?? ''

beforeAll(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'cosmos-remoto-'))
  // a ponte interna de mentira: anota o que chegou e responde JSON
  interno = createServer(exigirSegredo(segredo, (req, res) => { recebidos.push({ url: req.url, headers: req.headers }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}') }))
  await new Promise<void>((ok) => interno.listen(0, '127.0.0.1', ok))
  const conta = await criarContaRemota(SENHA)
  servidor = createServer(criarPortaRemota({ conta, html: Buffer.from('<!doctype html><html><head><title>C</title></head><body></body></html>'), interno: { porta: (interno.address() as { port: number }).port, segredo }, hosts: () => [host()], pastaDados: pasta }))
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  porta = (servidor.address() as { port: number }).port
}, 60_000)
afterAll(() => { servidor?.close(); interno?.close(); rmSync(pasta, { recursive: true, force: true }) })

describe('a porta remota', () => {
  it('recusa outro Host e, sem login, não abre nada', async () => {
    expect((await pedir('/cosmos/', { headers: { host: 'outro.exemplo.com' } })).status).toBe(421)
    const pagina = await pedir('/cosmos/')
    expect(pagina.status).toBe(303); expect(pagina.headers.location).toBe('/cosmos/entrar')
    expect((await pedir('/cosmos/__p0/ollama/estado')).status).toBe(401)
    expect((await pedir('/cosmos/__remoto/dados/ia-indice', { headers: { 'x-cosmos-remoto': '1' } })).status).toBe(401)
    expect(recebidos).toHaveLength(0)
  })

  it('a ponte interna só atende quem traz o segredo', async () => {
    const p = (interno.address() as { port: number }).port
    const status = await new Promise<number>((ok) => request({ hostname: '127.0.0.1', port: p, path: '/cosmos/__p0/ollama/estado' }, (r) => { r.resume(); ok(r.statusCode!) }).end())
    expect(status).toBe(403)
  })

  it('login de outra origem é barrado; senha errada não entra', async () => {
    const outra = await pedir('/cosmos/entrar', { method: 'POST', headers: { origin: 'https://mal.exemplo.com', 'content-type': 'application/x-www-form-urlencoded' }, corpo: `senha=${encodeURIComponent(SENHA)}` })
    expect(outra.status).toBe(403)
    const errada = await entrar('senha errada mas comprida')
    expect(errada.headers.location).toBe('/cosmos/entrar?erro=senha'); expect(errada.headers['set-cookie']).toBeUndefined()
  }, 30_000)

  it('com a senha certa: cookie __Host- seguro, a página com a marca do modo remoto e o pedido refeito para a ponte', async () => {
    const r = await entrar(SENHA)
    expect(r.headers.location).toBe('/cosmos/#/i-ai')
    const set = r.headers['set-cookie']![0]
    expect(set).toMatch(/^__Host-cosmos=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict/)
    const c = cookie(r.headers)
    const pagina = await pedir('/cosmos/', { headers: { cookie: c } })
    expect(pagina.status).toBe(200); expect(pagina.corpo).toContain('<meta name="cosmos-remoto" content="1">')
    expect(pagina.headers['x-frame-options']).toBe('DENY')
    recebidos = []
    const estado = await pedir('/cosmos/__p0/ollama', { method: 'POST', headers: { cookie: c, origin: origem(), 'sec-fetch-site': 'same-origin', 'x-cosmos-p0': '1', 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '1.2.3.4' }, corpo: '{}' })
    expect(estado.status).toBe(200)
    const h = recebidos[0].headers
    // o cookie, o Forwarded e os da Cloudflare ficam na porta; a origem vira a interna; o segredo vai junto
    expect(h.cookie).toBeUndefined(); expect(h['x-forwarded-for']).toBeUndefined(); expect(h['cf-connecting-ip']).toBeUndefined()
    expect(h.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/); expect(h.origin).not.toBe(origem())
    expect(h['x-cosmos-interno']).toBe(segredo); expect(h['x-cosmos-p0']).toBe('1')
    // sair derruba a sessão
    await pedir('/cosmos/sair', { method: 'POST', headers: { cookie: c, origin: origem() } })
    expect((await pedir('/cosmos/__p0/ollama/estado', { headers: { cookie: c } })).status).toBe(401)
  }, 30_000)

  it('o histórico fica cifrado no computador, preso ao nome do arquivo', async () => {
    const c = cookie((await entrar(SENHA)).headers)
    const gravar = (chave: string, valor: unknown) => pedir(`/cosmos/__remoto/dados/${chave}`, { method: 'PUT', headers: { cookie: c, origin: origem(), 'x-cosmos-remoto': '1', 'content-type': 'application/json' }, corpo: JSON.stringify({ valor }) })
    const ler = async (chave: string) => JSON.parse((await pedir(`/cosmos/__remoto/dados/${chave}`, { headers: { cookie: c, 'x-cosmos-remoto': '1' } })).corpo) as { valor: unknown }
    expect((await gravar('ia-msg-7', { pergunta: 'o celular esquentou' })).status).toBe(200)
    expect((await ler('ia-msg-7')).valor).toEqual({ pergunta: 'o celular esquentou' })
    expect((await ler('ia-msg-8')).valor).toBeNull()
    // no disco, nada em claro
    expect(readFileSync(join(pasta, 'ia-msg-7.json'), 'utf8')).not.toContain('celular')
    // trocar o arquivo de nome não engana: a chave do arquivo é dado associado da cifra
    renameSync(join(pasta, 'ia-msg-7.json'), join(pasta, 'ia-msg-9.json'))
    expect((await pedir('/cosmos/__remoto/dados/ia-msg-9', { headers: { cookie: c, 'x-cosmos-remoto': '1' } })).status).toBe(400)
    // só as chaves do histórico, nunca um caminho
    expect((await gravar('conta', {})).status).toBe(404)
    expect((await pedir('/cosmos/__remoto/dados/..%2Fx', { headers: { cookie: c, 'x-cosmos-remoto': '1' } })).status).toBe(404)
    expect(readdirSync(pasta).every((f) => /^ia-msg-\d+\.json$/.test(f))).toBe(true)
  }, 30_000)

  it('5 senhas erradas em 15 minutos bloqueiam o login, até a certa', async () => {
    for (let i = 0; i < 5; i++) await entrar(`errada numero ${i} comprida`)
    const bloqueada = await entrar(SENHA)
    expect(bloqueada.headers.location).toBe('/cosmos/entrar?erro=espera'); expect(bloqueada.headers['set-cookie']).toBeUndefined()
  }, 60_000)
})
