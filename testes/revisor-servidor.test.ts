/** O revisor como serviço para clientes (src/integracoes/revisor-servidor-node.ts), com um revisor de mentira. */
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { arquivoDeContas, criarServicoRevisor, type OpcoesServidorRevisor } from '../src/integracoes/revisor-servidor-node'
import type { RelatorioRevisor } from '../src/motor/revisor-relatorio'

const RELATORIO: RelatorioRevisor = { formato: 'cosmos-revisor-v1', extrator: 'extrator-v1', prompt: 'p', blocos: 1, afirmacoes: [], argumentos: [], avisos: [] }

async function ambiente(fn: (c: { pedir: (metodo: string, caminho: string, chave?: string, corpo?: unknown) => Promise<{ status: number; corpo: Record<string, unknown> }>; chaves: string[]; servico: ReturnType<typeof criarServicoRevisor>; soltar: () => void; relogio: { t: number } }) => Promise<void>, opcoes: Partial<OpcoesServidorRevisor> = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'cosmos-revisor-')), contas = arquivoDeContas(join(pasta, 'contas.json'))
  const chaves = [contas.nova('Empresa A', 3).chave, contas.nova('Empresa B').chave]
  let soltar: () => void = () => undefined
  const relogio = { t: Date.parse('2026-10-29T12:00:00Z') }
  const servico = criarServicoRevisor({ contas: contas.ler, agora: () => relogio.t, registrar: () => undefined,
    revisar: (texto) => new Promise((ok) => { soltar = () => ok({ ...RELATORIO, avisos: [`${texto.length}`] }) }), ...opcoes })
  const server = createServer((q, r) => { void servico.tratar(q, r) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const porta = (server.address() as { port: number }).port
  const pedir = async (metodo: string, caminho: string, chave?: string, corpo?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { ...(chave ? { Authorization: `Bearer ${chave}` } : {}), ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
    return { status: r.status, corpo: await r.json() as Record<string, unknown> }
  }
  try { await fn({ pedir, chaves, servico, soltar: () => soltar(), relogio }) } finally {
    servico.encerrar(); await new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections() }); rmSync(pasta, { recursive: true, force: true })
  }
}
const esperar = () => new Promise((r) => setTimeout(r, 20))

describe('revisor como serviço', () => {
  it('as contas guardam só o hash da chave', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'cosmos-revisor-')), arq = join(pasta, 'contas.json')
    const { chave, conta } = arquivoDeContas(arq).nova('Loja do Bairro')
    expect(chave).toMatch(/^cosmos_[A-Za-z0-9_-]{43}$/)
    expect(readFileSync(arq, 'utf8')).not.toContain(chave)
    expect(conta.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(arquivoDeContas(arq).remover(conta.id)).toBe(true)
    expect(arquivoDeContas(arq).ler()).toEqual([])
    expect(() => arquivoDeContas(arq).nova('<script>')).toThrow()
    rmSync(pasta, { recursive: true, force: true })
  })

  it('sem chave ou com chave errada: 401; a saúde não pede chave', async () => ambiente(async (c) => {
    expect((await c.pedir('GET', '/api/saude')).corpo).toEqual({ ok: true, fila: 0, rodando: false })
    expect((await c.pedir('POST', '/api/revisoes', undefined, { texto: 'a' })).status).toBe(401)
    expect((await c.pedir('POST', '/api/revisoes', `cosmos_${'A'.repeat(43)}`, { texto: 'a' })).status).toBe(401)
  }))

  it('a revisão vai para a fila, roda, o texto sai da memória e só o dono vê o relatório', async () => ambiente(async (c) => {
    const r = await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'Um plano.' })
    expect(r.status).toBe(202)
    const id = r.corpo.id as string
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    await esperar()
    expect((await c.pedir('GET', `/api/revisoes/${id}`, c.chaves[0])).corpo.estado).toBe('rodando')
    expect(c.servico.textosGuardados()).toBe(1)
    c.soltar(); await esperar()
    const pronto = await c.pedir('GET', `/api/revisoes/${id}`, c.chaves[0])
    expect(pronto.corpo).toMatchObject({ estado: 'pronto', relatorio: { formato: 'cosmos-revisor-v1', avisos: ['9'] }, expira_em: '2026-10-30T12:00:00.000Z' })
    expect(c.servico.textosGuardados()).toBe(0)
    // a outra conta não vê nem apaga
    expect((await c.pedir('GET', `/api/revisoes/${id}`, c.chaves[1])).status).toBe(404)
    expect((await c.pedir('DELETE', `/api/revisoes/${id}`, c.chaves[1])).status).toBe(404)
    // depois do prazo, o relatório some
    c.relogio.t += 24 * 3600_000 + 1
    expect((await c.pedir('GET', `/api/revisoes/${id}`, c.chaves[0])).status).toBe(404)
  }))

  it('limites: duas em andamento por conta, o limite do dia e o texto fora do formato', async () => ambiente(async (c) => {
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: '' })).status).toBe(400)
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'x'.repeat(20_001) })).status).toBe(400)
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'a', extra: 1 })).status).toBe(400)
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'um' })).status).toBe(202)
    const segunda = await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'dois' })
    expect(segunda.corpo).toMatchObject({ estado: 'na-fila', posicao: 1 })
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'três' })).corpo).toEqual({ erro: 'revisoes-em-andamento' })
    // a da fila pode ser apagada antes de rodar; a que roda, não
    expect((await c.pedir('DELETE', `/api/revisoes/${segunda.corpo.id}`, c.chaves[0])).corpo).toEqual({ id: segunda.corpo.id, apagada: true })
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'quatro' })).status).toBe(202)
    c.soltar(); await esperar(); c.soltar(); await esperar()
    // a conta A tem 3 por dia: a quarta do dia é recusada, e no dia seguinte volta
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'cinco' })).corpo).toEqual({ erro: 'limite-do-dia' })
    c.relogio.t += 24 * 3600_000
    expect((await c.pedir('POST', '/api/revisoes', c.chaves[0], { texto: 'seis' })).status).toBe(202)
  }))

  it('muitas chaves erradas do mesmo endereço: 429 por um minuto', async () => ambiente(async (c) => {
    for (let i = 0; i < 20; i++) expect((await c.pedir('GET', '/api/revisoes/' + '0'.repeat(32), `cosmos_${'B'.repeat(43)}`)).status).toBe(401)
    expect((await c.pedir('GET', '/api/revisoes/' + '0'.repeat(32), c.chaves[0])).status).toBe(429)
    c.relogio.t += 60_000
    expect((await c.pedir('GET', '/api/revisoes/' + '0'.repeat(32), c.chaves[0])).status).toBe(404)
  }))
})
