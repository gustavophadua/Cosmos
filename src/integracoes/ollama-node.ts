import type { IncomingMessage, ServerResponse } from 'node:http'
import { Worker } from 'node:worker_threads'
import { criarAdaptadorOllama, descarregarModeloOllama, descreverModeloOllama } from './provedores/ollama'
import { ESQUEMA_RESPOSTA, formalizarComReparo, mensagensDeFormalizacao, PROMPT_FORMALIZACAO, REPARO_FORMALIZACAO, SAIDA_FORMALIZACAO } from '../motor/formalizacao'
import { CLASSES, type Classe, type Item, type Termo } from '../motor/avaliacao'
import type { Conferencia } from '../motor/avaliacaoZ3'
import { cenarioDoSalto, ESQUEMA_EXTRACAO, EXTRATOR, MAX_TEXTO_REVISOR, revisarPlano, type RelatorioRevisor } from '../motor/revisor'
import exemplosTexto from '../../avaliacao/exemplos-publicos-v1.jsonl?raw'

const EXEMPLOS = exemplosTexto.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
/** O modelo da nota oficial (especificacao/avaliacao-v1.md §7). */
export const MODELO_OLLAMA_PADRAO = 'qwen3:4b'

class ErroOllama extends Error { constructor(readonly status: number, readonly codigo: string) { super(codigo) } }

/** Premissas e conclusão em texto: o único corpo aceito. Nada de mensagens, modelo ou opções vindos do navegador. */
export function validarTextoFormalizacao(x: unknown): { premissas: string[]; conclusao: string } {
  const o = x as { premissas?: unknown; conclusao?: unknown }
  const texto = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 500
  if (typeof x !== 'object' || x === null || Array.isArray(x) || Object.getPrototypeOf(x) !== Object.prototype
      || Object.keys(x).sort().join() !== 'conclusao,premissas' || !Array.isArray(o.premissas)
      || o.premissas.length < 1 || o.premissas.length > 10 || !o.premissas.every(texto) || !texto(o.conclusao)) throw new ErroOllama(400, 'invalido')
  return { premissas: (o.premissas as string[]).map((p) => p.trim()), conclusao: (o.conclusao as string).trim() }
}

export interface PropostaParaConferir { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }
const objetoSimples = (x: unknown, chaves: string): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
  && Object.getPrototypeOf(x) === Object.prototype && Object.keys(x).sort().join() === chaves
/** A proposta já lida no navegador, para o Z3 conferir: vocabulário, fórmulas e a classe dita. Só isso. */
export function validarPropostaConferir(x: unknown): PropostaParaConferir {
  const formula = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 1000
  const termo = (t: unknown) => objetoSimples(t, 'aridade,leitura,simbolo,tipo') && typeof t.simbolo === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(t.simbolo)
    && (t.tipo === 'predicado' || t.tipo === 'constante') && Number.isInteger(t.aridade) && (t.aridade as number) >= 0 && (t.aridade as number) <= 4 && typeof t.leitura === 'string' && t.leitura.length <= 80
  if (!objetoSimples(x, 'classe,conclusao,premissas,vocabulario') || !Array.isArray(x.vocabulario) || x.vocabulario.length < 1 || x.vocabulario.length > 40
      || !x.vocabulario.every(termo) || !Array.isArray(x.premissas) || x.premissas.length < 1 || x.premissas.length > 10 || !x.premissas.every(formula)
      || !formula(x.conclusao) || !(x.classe === null || CLASSES.includes(x.classe as Classe))) throw new ErroOllama(400, 'invalido')
  return { vocabulario: (x.vocabulario as Termo[]).map(({ simbolo, tipo, aridade, leitura }) => ({ simbolo, tipo, aridade, leitura })), premissas: x.premissas as string[], conclusao: x.conclusao as string, classe: x.classe as Classe | null }
}

export interface ConferidorZ3 { conferir(p: PropostaParaConferir): Promise<Conferencia>; parar(): void }
/**
 * O Z3 numa thread (z3-trabalhador-node.ts), aberta na primeira conferência e encerrada antes de cada pedido ao modelo,
 * depois de um minuto parada ou se uma conferência passar de 60 s.
 */
export function criarConferidorZ3(arquivo: URL): ConferidorZ3 {
  let w: Worker | null = null, n = 0, ocioso: ReturnType<typeof setTimeout> | undefined
  const espera = new Map<number, { ok: (c: Conferencia) => void; nao: (e: Error) => void; prazo: ReturnType<typeof setTimeout> }>()
  const parar = () => {
    clearTimeout(ocioso)
    if (w) { void w.terminate(); w = null }
    for (const e of espera.values()) { clearTimeout(e.prazo); e.nao(new Error('o Z3 foi encerrado')) }
    espera.clear()
  }
  const conferir = (p: PropostaParaConferir) => new Promise<Conferencia>((ok, nao) => {
    if (!w) {
      const t = w = new Worker(arquivo)
      t.on('message', (m: { id: number; conferencia?: Conferencia; erro?: string }) => {
        const e = espera.get(m.id); if (!e) return
        espera.delete(m.id); clearTimeout(e.prazo)
        if (m.conferencia) e.ok(m.conferencia); else e.nao(new Error(m.erro ?? 'o Z3 falhou'))
      })
      t.on('error', () => { if (w === t) parar() })
      t.on('exit', () => { if (w === t) parar() })
    }
    clearTimeout(ocioso); ocioso = setTimeout(parar, 60_000); ocioso.unref()
    const id = ++n
    espera.set(id, { ok, nao, prazo: setTimeout(parar, 60_000) })
    w.postMessage({ id, proposta: p })
  })
  return { conferir, parar }
}

/** O texto do plano para o revisor: o único corpo aceito em `ollama/revisar`. */
export function validarTextoRevisor(x: unknown): string {
  if (!objetoSimples(x, 'texto') || typeof x.texto !== 'string' || !x.texto.trim() || x.texto.length > MAX_TEXTO_REVISOR) throw new ErroOllama(400, 'invalido')
  return x.texto
}

/**
 * A formalização pelo Ollama local, servida pela ponte (rotas `ollama/estado` e `ollama`). Só o pedido fixo
 * (PROMPT_FORMALIZACAO, saída presa ao esquema, temperatura 0): o navegador manda premissas e conclusão, nunca mensagens,
 * modelo ou destino. O texto não sai do aparelho. Uma chamada de cada vez; na CPU, cada uma leva cerca de um minuto.
 * Não depende da sessão P0 (15 minutos, feita para a chave do Groq): aqui não há segredo, e a rota vale enquanto o
 * serviço local estiver aberto, presa à mesma origem e ao marcador da ponte.
 */
export function criarControleOllama(opcoes: { modelo?: string; buscar?: typeof fetch; prazoMs?: number; conferidor?: ConferidorZ3 }) {
  const modelo = opcoes.modelo ?? MODELO_OLLAMA_PADRAO
  const perguntar = criarAdaptadorOllama({ modelo, formato: ESQUEMA_RESPOSTA, temperatura: 0, semente: 0, contexto: 4096, buscar: opcoes.buscar, prazoMs: opcoes.prazoMs ?? 300_000 })
  // o extrator do revisor lê um bloco de até 1.500 caracteres e devolve a lista de afirmações: precisa de mais contexto
  const extrair = criarAdaptadorOllama({ modelo, formato: ESQUEMA_EXTRACAO, temperatura: 0, semente: 0, contexto: 8192, buscar: opcoes.buscar, prazoMs: opcoes.prazoMs ?? 300_000 })
  let pendente = false, encerrado = false
  // o revisor roda em segundo plano (minutos); a tela acompanha por `ollama/revisar/estado`. Uma revisão de cada vez, e
  // enquanto ela roda as outras rotas que usam o modelo respondem "ocupado"
  let revisao: { id: number; estado: 'rodando' | 'pronto' | 'erro'; fase: string; feito: number; total: number; inicio: number; relatorio?: RelatorioRevisor; erro?: string } | null = null
  let revisoes = 0
  const iniciarRevisao = (texto: string) => {
    const r = revisao = { id: ++revisoes, estado: 'rodando' as const, fase: 'extraindo', feito: 0, total: 0, inicio: Date.now() }
    pendente = true
    opcoes.conferidor?.parar()
    void revisarPlano(texto, {
      prompt: PROMPT_FORMALIZACAO, extrair, formalizar: perguntar,
      mensagens: (t) => mensagensDeFormalizacao(t, null, EXEMPLOS),
      descarregar: () => descarregarModeloOllama(modelo, opcoes.buscar),
      classificar: async (p) => {
        if (!opcoes.conferidor) throw new Error('o Z3 não está disponível')
        const c = await opcoes.conferidor.conferir({ ...p, classe: null })
        if (c.classeZ3) return c.classeZ3
        throw new Error(c.motivo || 'o Z3 não decidiu')
      },
      progresso: (fase, feito, total) => { if (revisao === r) Object.assign(r, { fase, feito, total }) },
    }).then((relatorio) => { if (revisao === r) revisao = { ...r, estado: 'pronto', relatorio } },
      (e) => { if (revisao === r) revisao = { ...r, estado: 'erro', erro: (e as Error).message } })
      .finally(() => { if (revisao?.id === r.id) pendente = false })
  }
  const enviar = (res: ServerResponse, status: number, v: unknown) => {
    if (res.destroyed || res.writableEnded) return
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' })
    res.end(JSON.stringify(v))
  }
  const lerCorpo = (req: IncomingMessage, limite = 16384) => new Promise<unknown>((resolve, reject) => {
    const partes: Buffer[] = []; let bytes = 0
    const timer = setTimeout(() => { limpar(); reject(new ErroOllama(408, 'invalido')) }, 5000)
    const limpar = () => { clearTimeout(timer); req.off('data', data); req.off('end', end) }
    const data = (b: Buffer) => {
      bytes += b.length
      if (bytes > limite) { limpar(); req.pause(); reject(new ErroOllama(413, 'invalido')); return }
      partes.push(b)
    }
    const end = () => {
      limpar()
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes)))) } catch { reject(new ErroOllama(400, 'invalido')) }
    }
    req.on('data', data); req.once('end', end)
  })
  async function tratar(req: IncomingMessage, res: ServerResponse, rota: string) {
    try {
      if (encerrado) throw new ErroOllama(503, 'encerrado')
      if (rota === 'ollama/estado') {
        try {
          enviar(res, 200, { formato: 'cosmos-ollama-v1', estado: 'pronto', ...(await descreverModeloOllama(modelo, opcoes.buscar)), prompt: PROMPT_FORMALIZACAO, saida: SAIDA_FORMALIZACAO, reparo: REPARO_FORMALIZACAO, extrator: EXTRATOR })
        } catch (e) {
          enviar(res, 200, { formato: 'cosmos-ollama-v1', estado: /não está instalado/.test((e as Error).message) ? 'sem-modelo' : 'indisponivel', modelo })
        }
        return
      }
      if (rota === 'ollama/revisar/estado') {
        const r = revisao
        enviar(res, 200, r ? { formato: 'cosmos-revisor-estado-v1', id: r.id, estado: r.estado, fase: r.fase, feito: r.feito, total: r.total, ms: Date.now() - r.inicio,
          ...(r.relatorio ? { relatorio: r.relatorio } : {}), ...(r.erro ? { erro: r.erro } : {}) } : { formato: 'cosmos-revisor-estado-v1', estado: 'livre' })
        return
      }
      if (pendente) throw new ErroOllama(429, 'ocupado')
      if (rota === 'ollama/revisar') {
        iniciarRevisao(validarTextoRevisor(await lerCorpo(req, 131072)))
        enviar(res, 202, { formato: 'cosmos-revisor-estado-v1', id: revisao!.id, estado: 'rodando', fase: 'extraindo', feito: 0, total: 0, ms: 0 })
        return
      }
      pendente = true
      try {
        if (rota === 'ollama/conferir') {
          // o modo automático: o modelo sai da memória e o Z3 confere a classe que ele disse
          if (!opcoes.conferidor) throw new ErroOllama(503, 'indisponivel')
          const p = validarPropostaConferir(await lerCorpo(req, 32768))
          await descarregarModeloOllama(modelo, opcoes.buscar).catch(() => undefined)
          const c = await opcoes.conferidor.conferir(p)
          if (encerrado) throw new ErroOllama(503, 'indisponivel')
          // no salto, o cenário que derruba a conclusão, pelo motor finito (a Conversa mostra)
          const cenario = c.classeZ3 === 'independente' ? cenarioDoSalto(p) : undefined
          enviar(res, 200, { formato: 'cosmos-ollama-conferencia-v1', classe_z3: c.classeZ3, aceita: c.aceita, motivo: c.motivo, ...(cenario ? { cenario } : {}) })
          return
        }
        const texto = validarTextoFormalizacao(await lerCorpo(req))
        opcoes.conferidor?.parar()
        const inicio = Date.now()
        // a resposta que não se lê, ou com premissa a mais ou a menos, volta uma vez ao modelo com o erro (reparo-v1)
        const r = await formalizarComReparo(perguntar, mensagensDeFormalizacao(texto, null, EXEMPLOS), null, texto.premissas.length)
        if (encerrado) throw new ErroOllama(503, 'indisponivel')
        enviar(res, 200, { formato: 'cosmos-ollama-resposta-v1', modelo, conteudo: r.conteudo, prompt_tokens: r.prompt, completion_tokens: r.completion, ms: Date.now() - inicio, reparo: r.reparo })
      } finally { pendente = false }
    } catch (e) {
      const erro = e instanceof ErroOllama ? e : new ErroOllama(503, 'indisponivel')
      enviar(res, erro.status, { erro: erro.codigo })
    }
  }
  return Object.freeze({ tratar, encerrar() { encerrado = true; opcoes.conferidor?.parar() } })
}
