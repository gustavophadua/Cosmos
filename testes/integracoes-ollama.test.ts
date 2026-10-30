/**
 * A formalização pelo Ollama local na ponte do serviço local (src/integracoes/ollama-node.ts), ponta a ponta com a API
 * P0 real e o Ollama de mentira: o navegador manda só premissas e conclusão; o pedido fixo sai só para 127.0.0.1.
 */
import { createServer, request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { criarApiIntegracoes } from '../src/integracoes/api-node'
import { criarPonteIntegracoes } from '../src/integracoes/ponte-node'
import { validarTextoFormalizacao, type ConferidorZ3, type PropostaParaConferir } from '../src/integracoes/ollama-node'
import { criarClienteOllama } from '../src/interfaces/ollama-cliente'
import { ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, lerProposta } from '../src/motor/formalizacao'

const DIGEST = 'b'.repeat(64)
const PROPOSTA = JSON.stringify({ vocabulario: [{ simbolo: 'Gato', tipo: 'predicado', aridade: 1, leitura: 'gato' }, { simbolo: 'Banho', tipo: 'predicado', aridade: 1, leitura: 'gosta de banho' }, { simbolo: 'mimi', tipo: 'constante', aridade: 0, leitura: 'Mimi' }],
  premissas: ['∀x (Gato(x) ⟹ ¬Banho(x))', 'Gato(mimi)'], conclusao: '¬Banho(mimi)', classe: 'segue' })
// a tradução cega devolve as mesmas fórmulas sem classe: a classe fica para o Z3
const CEGA = JSON.stringify({ ...JSON.parse(PROPOSTA), classe: null })
const TEXTO = { premissas: ['Nenhum gato gosta de banho.', 'Mimi é uma gata.'], conclusao: 'Mimi não gosta de banho.' }

function ollamaFalso(rodando = true, chats: string[] = []) {
  const pedidos: { url: string; corpo: unknown }[] = []
  const buscar = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, corpo: init?.body ? JSON.parse(init.body as string) : undefined })
    if (!rodando) throw new TypeError('fetch failed')
    const respostas: Record<string, unknown> = {
      '/api/tags': { models: [{ name: 'qwen3:4b', model: 'qwen3:4b', digest: DIGEST }] }, '/api/version': { version: '0.40.12' },
      '/api/chat': { message: { content: chats.shift() ?? PROPOSTA }, prompt_eval_count: 1100, eval_count: 160 }, '/api/generate': { done: true },
    }
    const caminho = new URL(url).pathname
    return new Response(JSON.stringify(respostas[caminho]), { status: caminho in respostas ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return { buscar, pedidos }
}

type Chamada = { rota: string; metodo?: string; corpo?: unknown; headers?: Record<string, string | undefined> }
async function ambiente(fn: (c: { cliente: ReturnType<typeof criarClienteOllama>; chamar: (o: Chamada) => Promise<number>; pedidos: { url: string; corpo: unknown }[] }) => Promise<void>, o: { ligado?: boolean; rodando?: boolean; ttlSessaoMs?: number; conferidor?: ConferidorZ3; chats?: string[] } = {}) {
  let ponte: ReturnType<typeof criarPonteIntegracoes> | undefined
  const server = createServer((q, r) => ponte!.tratar(q, r))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port, origem = `http://127.0.0.1:${port}`
  const api = criarApiIntegracoes({ origemPermitida: origem, ...(o.ttlSessaoMs ? { ttlSessaoMs: o.ttlSessaoMs } : {}) })
  const falso = ollamaFalso(o.rodando ?? true, o.chats)
  const chamar = (c: Chamada) => new Promise<number>((resolve, reject) => {
    const corpo = c.corpo === undefined ? undefined : JSON.stringify(c.corpo)
    const headers = Object.fromEntries(Object.entries({ Origin: origem, 'X-Cosmos-P0': '1', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...c.headers }).filter(([, v]) => v !== undefined)) as Record<string, string>
    const req = request({ hostname: '127.0.0.1', port, path: `/cosmos/__p0/${c.rota}`, method: c.metodo ?? 'GET', headers, agent: false }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)) })
    req.on('error', reject); req.end(corpo)
  })
  try {
    const endereco = await api.iniciar(), token = api.emitirSessaoLocal().token
    ponte = criarPonteIntegracoes({ origem, portaApi: endereco.porta, token, ...(o.ligado === false ? {} : { ollama: { buscar: falso.buscar, ...(o.conferidor ? { conferidor: o.conferidor } : {}) } }) })
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
    expect(r).toEqual({ conteudo: CEGA, prompt_tokens: 2200, completion_tokens: 320 })
    expect(lerProposta(r.conteudo, null).conclusao).toBe('¬Banho(mimi)')
    // duas chamadas: as premissas sem a conclusão, depois a conclusão sem as premissas
    const [premissas, conclusao] = c.pedidos.filter((p) => p.url.endsWith('/api/chat'))
    expect(premissas.url).toBe('http://127.0.0.1:11434/api/chat')
    expect(premissas.corpo).toMatchObject({ model: 'qwen3:4b', stream: false, think: false, format: ESQUEMA_PREMISSAS, options: { temperature: 0, seed: 0, num_ctx: 4096 } })
    expect(conclusao.corpo).toMatchObject({ model: 'qwen3:4b', stream: false, think: false, format: ESQUEMA_CONCLUSAO, options: { temperature: 0, seed: 0, num_ctx: 4096 } })
    const ultima = (x: typeof premissas) => (x.corpo as { messages: { role: string; content: string }[] }).messages.at(-1)!.content
    expect((premissas.corpo as { messages: { role: string }[] }).messages[0].role).toBe('system')
    expect(ultima(premissas)).toContain('Mimi é uma gata.')
    expect(ultima(premissas)).not.toContain('Mimi não gosta de banho.')
    expect(ultima(conclusao)).toContain('Mimi não gosta de banho.')
    expect(ultima(conclusao)).not.toContain('Mimi é uma gata.')
    expect(c.pedidos.every((p) => p.url.startsWith('http://127.0.0.1:11434/'))).toBe(true)
  }))

  it('reparo: a resposta com premissa de fora volta uma vez ao modelo com o erro; a segunda vale', async () => {
    const SEM_PREMISSA = JSON.stringify({ ...JSON.parse(PROPOSTA), premissas: ['∀x (Gato(x) ⟹ ¬Banho(x))'] })
    await ambiente(async (c) => {
      const r = await c.cliente.formalizar(TEXTO)
      expect(r).toEqual({ conteudo: CEGA, prompt_tokens: 3300, completion_tokens: 480, reparo: 'premissas: o texto tem 2 premissa(s) e a resposta tem 1; escreva uma fórmula para cada premissa, na mesma ordem' })
      const chats = c.pedidos.filter((p) => p.url.endsWith('/api/chat')).map((p) => (p.corpo as { messages: { role: string; content: string }[] }).messages)
      expect(chats).toHaveLength(3)
      expect(chats[1].slice(0, -2)).toEqual(chats[0])
      expect(chats[1].at(-2)).toEqual({ role: 'assistant', content: SEM_PREMISSA })
      expect(chats[1].at(-1)!.content).toContain('o texto tem 2 premissa(s)')
      // a resposta certa de primeira não volta
      await c.cliente.formalizar(TEXTO)
      expect(c.pedidos.filter((p) => p.url.endsWith('/api/chat'))).toHaveLength(5)
    }, { chats: [SEM_PREMISSA] })
  })

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

  it('continua depois que a sessão P0 expira: a rota não depende da sessão do Groq', async () => ambiente(async (c) => {
    // o caso real da tela em 28/10/2026: "sessao-expirada" 15 minutos depois de abrir o serviço
    await new Promise((r) => setTimeout(r, 120))
    expect((await c.cliente.carregar()).estado).toBe('pronto')
    expect((await c.cliente.formalizar(TEXTO)).conteudo).toBe(CEGA)
  }, { ttlSessaoMs: 50 }))

  it('modo automático: a conferência tira o modelo da memória e chama o Z3; pedir ao modelo encerra o Z3', async () => {
    const recebidas: PropostaParaConferir[] = [], eventos: string[] = []
    const conferidor: ConferidorZ3 = {
      async conferir(p) { recebidas.push(p); eventos.push('z3'); return { classeZ3: 'segue', aceita: p.classe === 'segue', motivo: p.classe === 'segue' ? '' : `o modelo disse ${p.classe}, o Z3 diz segue` } },
      parar() { eventos.push('parar') },
    }
    await ambiente(async (c) => {
      const p = lerProposta(PROPOSTA, null)
      expect(await c.cliente.conferir(p)).toEqual({ classeZ3: 'segue', aceita: true, motivo: '' })
      expect(await c.cliente.conferir({ ...p, classe: 'contradiz' })).toEqual({ classeZ3: 'segue', aceita: false, motivo: 'o modelo disse contradiz, o Z3 diz segue' })
      // o navegador manda só vocabulário, fórmulas e classe; o modelo sai da memória pelo pedido fixo, antes do Z3
      expect(recebidas[0]).toEqual({ vocabulario: p.vocabulario, premissas: p.premissas, conclusao: p.conclusao, classe: 'segue' })
      const descarregar = c.pedidos.filter((x) => x.url.endsWith('/api/generate'))
      expect(descarregar.map((x) => [x.url, x.corpo])).toEqual([['http://127.0.0.1:11434/api/generate', { model: 'qwen3:4b', keep_alive: 0 }], ['http://127.0.0.1:11434/api/generate', { model: 'qwen3:4b', keep_alive: 0 }]])
      await c.cliente.formalizar(TEXTO)
      expect(eventos).toEqual(['z3', 'z3', 'parar'])
      // corpo fora do formato: recusado antes do Ollama e do Z3
      for (const corpo of [{ ...p, extra: 1 }, { vocabulario: [], premissas: p.premissas, conclusao: p.conclusao, classe: 'segue' }, { vocabulario: p.vocabulario, premissas: p.premissas, conclusao: p.conclusao, classe: 'talvez' },
        { vocabulario: [{ ...p.vocabulario[0], tipo: 'funcao' }], premissas: p.premissas, conclusao: p.conclusao, classe: 'segue' }, { vocabulario: p.vocabulario, premissas: ['x'.repeat(1001)], conclusao: p.conclusao, classe: 'segue' }])
        expect(await c.chamar({ rota: 'ollama/conferir', metodo: 'POST', corpo })).toBe(400)
      expect(recebidas).toHaveLength(2)
      expect(await c.chamar({ rota: 'ollama/conferir', metodo: 'GET' })).toBe(405)
    }, { conferidor })
  })

  it('revisor: o plano roda em segundo plano (extrator, tradução, modelo fora da memória, Z3) e as outras rotas esperam', async () => {
    const eventos: string[] = []
    const conferidor: ConferidorZ3 = { async conferir(p) { eventos.push(`z3 ${p.conclusao}`); return { classeZ3: 'segue', aceita: true, motivo: '' } }, parar() { eventos.push('parar') } }
    const EXTRACAO = JSON.stringify({ afirmacoes: [{ id: 1, texto: 'Nenhum gato gosta de banho.' }, { id: 2, texto: 'Mimi é uma gata.' }, { id: 3, texto: 'Mimi não gosta de banho.' }], argumentos: [{ conclusao: 3, apoios: [1, 2] }] })
    await ambiente(async (c) => {
      expect(await c.cliente.estadoRevisao()).toEqual({ estado: 'livre' })
      expect(await c.cliente.revisar('Nenhum gato gosta de banho. Mimi é uma gata. Então Mimi não gosta de banho.')).toEqual({ estado: 'rodando', id: 1 })
      let e = await c.cliente.estadoRevisao()
      for (let i = 0; i < 100 && e.estado === 'rodando'; i++) { await new Promise((r) => setTimeout(r, 20)); e = await c.cliente.estadoRevisao() }
      expect(e.estado).toBe('pronto')
      expect(e.relatorio!.argumentos.map((a) => [a.conclusao, a.veredito])).toEqual([['Mimi não gosta de banho.', 'provado']])
      expect(e.relatorio!.prompt).toMatch(/^cego-v\d+ \(formalizacao-v\d+\)$/)
      // o extrator com o esquema dele e mais contexto; depois a tradução; o modelo sai da memória antes do Z3
      const chats = c.pedidos.filter((p) => p.url.endsWith('/api/chat')).map((p) => p.corpo as { format: { required: string[] }; options: { num_ctx: number } })
      expect(chats.map((x) => [x.format.required.join(), x.options.num_ctx])).toEqual([['afirmacoes,argumentos', 8192], ['vocabulario,premissas', 4096], ['vocabulario,conclusao', 4096]])
      expect(eventos).toEqual(['parar', 'z3 ¬Banho(mimi)'])
      expect(c.pedidos.at(-1)!.url).toBe('http://127.0.0.1:11434/api/generate')
      // texto vazio, grande demais ou com campos a mais: recusado
      for (const corpo of [{ texto: '' }, { texto: 'x'.repeat(20_001) }, { texto: 'a', extra: 1 }]) expect(await c.chamar({ rota: 'ollama/revisar', metodo: 'POST', corpo })).toBe(400)
    }, { conferidor, chats: [EXTRACAO, PROPOSTA] })
  })

  it('a ligação que falta: a busca pelo Z3 primeiro; sem forma que feche, o modelo (fora da memória antes do Z3); corpo fora do formato, recusado', async () => {
    const eventos: string[] = []
    const conferidor: ConferidorZ3 = { async conferir() { eventos.push('z3'); return { classeZ3: 'independente', aceita: true, motivo: '' } }, parar() { eventos.push('parar') } }
    await ambiente(async (c) => {
      const p = lerProposta(PROPOSTA, null)
      const r = await c.cliente.ponte({ vocabulario: p.vocabulario, premissas: p.premissas, conclusao: p.conclusao, cenario: ['mimi: é gato; gosta de banho'] })
      // nada fecha (o Z3 de mentira diz sempre "independente") e o modelo de mentira não responde com a ligação
      expect(r).toEqual({ opcoes: [], motivo: 'falta a fórmula da ligação' })
      const chats = c.pedidos.filter((x) => x.url.endsWith('/api/chat')).map((x) => x.corpo as { format: { required: string[] }; messages: { content: string }[] })
      expect(chats.map((x) => x.format.required.join())).toEqual(['ponte', 'ponte'])
      expect(chats[0].messages.at(-1)!.content).toContain('mimi: é gato; gosta de banho')
      expect(eventos.filter((e) => e === 'parar').length).toBe(2)
      for (const corpo of [{ ...p, classe: null, cenario: [] }, { vocabulario: p.vocabulario, premissas: p.premissas, conclusao: p.conclusao, cenario: 'x' }])
        expect(await c.chamar({ rota: 'ollama/ponte', metodo: 'POST', corpo })).toBe(400)
    }, { conferidor })
  })

  it('sem --ollama a rota não existe; com o Ollama parado o estado diz indisponível', async () => {
    await ambiente(async (c) => { expect(await c.chamar({ rota: 'ollama/estado' })).toBe(503) }, { ligado: false })
    await ambiente(async (c) => { expect((await c.cliente.carregar()).estado).toBe('indisponivel') }, { rodando: false })
  })
})
