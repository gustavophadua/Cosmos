/**
 * A formalização pelo Ollama local na ponte do serviço local (src/integracoes/ollama-node.ts), ponta a ponta com a API
 * P0 real e o Ollama de mentira: o navegador manda só premissas e conclusão; o pedido fixo sai só para 127.0.0.1.
 */
import { createServer, request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { criarApiIntegracoes } from '../src/integracoes/api-node'
import { criarPonteIntegracoes } from '../src/integracoes/ponte-node'
import { validarTextoFormalizacao } from '../src/integracoes/ollama-node'
import { criarClienteOllama } from '../src/interfaces/ollama-cliente'
import { ESQUEMA_RESPOSTA, lerProposta } from '../src/motor/formalizacao'

const DIGEST = 'b'.repeat(64)
const PROPOSTA = JSON.stringify({ vocabulario: [{ simbolo: 'Gato', tipo: 'predicado', aridade: 1, leitura: 'gato' }, { simbolo: 'Banho', tipo: 'predicado', aridade: 1, leitura: 'gosta de banho' }, { simbolo: 'mimi', tipo: 'constante', aridade: 0, leitura: 'Mimi' }],
  premissas: ['∀x (Gato(x) ⟹ ¬Banho(x))', 'Gato(mimi)'], conclusao: '¬Banho(mimi)', classe: 'segue' })
const TEXTO = { premissas: ['Nenhum gato gosta de banho.', 'Mimi é uma gata.'], conclusao: 'Mimi não gosta de banho.' }

function ollamaFalso(rodando = true) {
  const pedidos: { url: string; corpo: unknown }[] = []
  const buscar = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, corpo: init?.body ? JSON.parse(init.body as string) : undefined })
    if (!rodando) throw new TypeError('fetch failed')
    const respostas: Record<string, unknown> = {
      '/api/tags': { models: [{ name: 'qwen3:4b', model: 'qwen3:4b', digest: DIGEST }] }, '/api/version': { version: '0.40.12' },
      '/api/chat': { message: { content: PROPOSTA }, prompt_eval_count: 1100, eval_count: 160 },
    }
    const caminho = new URL(url).pathname
    return new Response(JSON.stringify(respostas[caminho]), { status: caminho in respostas ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return { buscar, pedidos }
}

type Chamada = { rota: string; metodo?: string; corpo?: unknown; headers?: Record<string, string | undefined> }
async function ambiente(fn: (c: { cliente: ReturnType<typeof criarClienteOllama>; chamar: (o: Chamada) => Promise<number>; pedidos: { url: string; corpo: unknown }[] }) => Promise<void>, o: { ligado?: boolean; rodando?: boolean } = {}) {
  let ponte: ReturnType<typeof criarPonteIntegracoes> | undefined
  const server = createServer((q, r) => ponte!.tratar(q, r))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port, origem = `http://127.0.0.1:${port}`
  const api = criarApiIntegracoes({ origemPermitida: origem })
  const falso = ollamaFalso(o.rodando ?? true)
  const chamar = (c: Chamada) => new Promise<number>((resolve, reject) => {
    const corpo = c.corpo === undefined ? undefined : JSON.stringify(c.corpo)
    const headers = Object.fromEntries(Object.entries({ Origin: origem, 'X-Cosmos-P0': '1', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...c.headers }).filter(([, v]) => v !== undefined)) as Record<string, string>
    const req = request({ hostname: '127.0.0.1', port, path: `/cosmos/__p0/${c.rota}`, method: c.metodo ?? 'GET', headers, agent: false }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)) })
    req.on('error', reject); req.end(corpo)
  })
  try {
    const endereco = await api.iniciar(), token = api.emitirSessaoLocal().token
    ponte = criarPonteIntegracoes({ origem, portaApi: endereco.porta, token, ...(o.ligado === false ? {} : { ollama: { buscar: falso.buscar } }) })
    const browser: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, Origin: origem, 'Sec-Fetch-Site': 'same-origin' } })
    await fn({ cliente: criarClienteOllama(origem, browser), chamar, pedidos: falso.pedidos })
  } finally {
    ponte?.encerrar(); await api.encerrar()
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() })
  }
}

describe('Formalização pelo Ollama local na ponte', () => {
  it('estado com digest; a proposta sai com o pedido fixo, só para 127.0.0.1, e se lê', async () => ambiente(async (c) => {
    expect(await c.cliente.carregar()).toEqual({ estado: 'pronto', modelo: 'qwen3:4b', digest: DIGEST, ollama: '0.40.12' })
    const r = await c.cliente.formalizar(TEXTO)
    expect(r).toEqual({ conteudo: PROPOSTA, prompt_tokens: 1100, completion_tokens: 160 })
    expect(lerProposta(r.conteudo, null).conclusao).toBe('¬Banho(mimi)')
    const chat = c.pedidos.find((p) => p.url.endsWith('/api/chat'))!
    expect(chat.url).toBe('http://127.0.0.1:11434/api/chat')
    expect(chat.corpo).toMatchObject({ model: 'qwen3:4b', stream: false, think: false, format: ESQUEMA_RESPOSTA, options: { temperature: 0, seed: 0, num_ctx: 4096 } })
    const mensagens = (chat.corpo as { messages: { role: string; content: string }[] }).messages
    expect(mensagens[0].role).toBe('system')
    expect(mensagens.at(-1)!.content).toContain('Mimi não gosta de banho.')
    expect(c.pedidos.every((p) => p.url.startsWith('http://127.0.0.1:11434/'))).toBe(true)
  }))

  it('o corpo é só premissas e conclusão: mensagens, modelo ou campos a mais são recusados antes do Ollama', async () => ambiente(async (c) => {
    for (const corpo of [{ ...TEXTO, model: 'outro' }, { messages: [{ role: 'user', content: 'oi' }] }, { premissas: [], conclusao: 'x' }, { premissas: ['a'], conclusao: '' }, { premissas: ['a'.repeat(501)], conclusao: 'b' }])
      expect(await c.chamar({ rota: 'ollama', metodo: 'POST', corpo })).toBe(400)
    expect(c.pedidos.some((p) => p.url.endsWith('/api/chat'))).toBe(false)
    expect(() => validarTextoFormalizacao(Object.assign(Object.create({ herdado: 1 }), TEXTO))).toThrow()
  }))

  it('origem, marcador e método fora da política barrados antes do Ollama', async () => ambiente(async (c) => {
    for (const headers of [{ Origin: 'https://evil.invalid' }, { 'X-Cosmos-P0': undefined }, { 'Sec-Fetch-Site': 'cross-site' }, { Cookie: 'x=1' }])
      expect(await c.chamar({ rota: 'ollama', metodo: 'POST', corpo: TEXTO, headers })).toBeGreaterThanOrEqual(400)
    expect(await c.chamar({ rota: 'ollama', metodo: 'GET' })).toBe(405)
    expect(await c.chamar({ rota: 'ollama/qualquer' })).toBe(404)
    expect(c.pedidos).toHaveLength(0)
  }))

  it('sem --ollama a rota não existe; com o Ollama parado o estado diz indisponível', async () => {
    await ambiente(async (c) => { expect(await c.chamar({ rota: 'ollama/estado' })).toBe(503) }, { ligado: false })
    await ambiente(async (c) => { expect((await c.cliente.carregar()).estado).toBe('indisponivel') }, { rodando: false })
  })
})
