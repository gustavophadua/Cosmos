import type { IncomingMessage, ServerResponse } from 'node:http'
import { Worker } from 'node:worker_threads'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { verificarMensagemLocalTeste } from '../v4/carteira'
import { criarAdaptadorOllama, descarregarModeloOllama, descreverModeloOllama } from './provedores/ollama'
import { CEGO_FORMALIZACAO, ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, formalizarCego, PROMPT_FORMALIZACAO, REPARO_FORMALIZACAO, SAIDA_FORMALIZACAO } from '../motor/formalizacao'
import { CLASSES, type Classe, type Item, type Termo } from '../motor/avaliacao'
import type { Conferencia } from '../motor/avaliacaoZ3'
import { cenarioDoSalto, ESQUEMA_EXTRACAO, EXTRATOR, MAX_TEXTO_REVISOR, revisarPlano, type RelatorioRevisor } from '../motor/revisor'
import { buscarPonte, ESQUEMA_PONTE, PONTE, type ArgumentoFormal } from '../motor/ponte'
import type { ModeloGroq } from './groq-contratos'
import { ErroGroq, type PedidoGroq } from './provedores/groq'
import exemplosTexto from '../../avaliacao/exemplos-publicos-v1.jsonl?raw'

const EXEMPLOS = exemplosTexto.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
/** O modelo da nota oficial (especificacao/avaliacao-v1.md §7). */
export const MODELO_OLLAMA_PADRAO = 'qwen3:4b'

class ErroOllama extends Error { constructor(readonly status: number, readonly codigo: string) { super(codigo) } }

/**
 * Premissas e conclusão em texto, e o vocabulário quando a pessoa corrigiu os termos na Conversa: o único corpo aceito.
 * Nada de mensagens, modelo ou opções vindos do navegador.
 */
export function validarTextoFormalizacao(x: unknown): { premissas: string[]; conclusao: string; vocabulario?: Termo[]; nuvem?: true } {
  const o = x as { premissas?: unknown; conclusao?: unknown; vocabulario?: unknown; nuvem?: unknown }
  const texto = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 500
  // "nuvem": true, só esse valor, quando a pessoa ligou o modelo grande na Conversa
  const chaves = typeof x === 'object' && x !== null ? Object.keys(x).filter((k) => k !== 'vocabulario' && k !== 'nuvem').sort().join() : ''
  if (typeof x !== 'object' || x === null || Array.isArray(x) || Object.getPrototypeOf(x) !== Object.prototype
      || chaves !== 'conclusao,premissas' || (o.nuvem !== undefined && o.nuvem !== true) || !Array.isArray(o.premissas)
      || o.premissas.length < 1 || o.premissas.length > 10 || !o.premissas.every(texto) || !texto(o.conclusao)
      || (o.vocabulario !== undefined && (!Array.isArray(o.vocabulario) || o.vocabulario.length < 1 || o.vocabulario.length > 40 || !o.vocabulario.every(termoValido)))) throw new ErroOllama(400, 'invalido')
  return { premissas: (o.premissas as string[]).map((p) => p.trim()), conclusao: (o.conclusao as string).trim(),
    ...(o.vocabulario ? { vocabulario: (o.vocabulario as Termo[]).map(({ simbolo, tipo, aridade, leitura }) => ({ simbolo, tipo, aridade, leitura })) } : {}),
    ...(o.nuvem === true ? { nuvem: true as const } : {}) }
}

export interface PropostaParaConferir { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }
const objetoSimples = (x: unknown, chaves: string): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
  && Object.getPrototypeOf(x) === Object.prototype && Object.keys(x).sort().join() === chaves
/** A proposta já lida no navegador, para o Z3 conferir: vocabulário, fórmulas e a classe dita. Só isso. */
function termoValido(t: unknown) {
  return objetoSimples(t, 'aridade,leitura,simbolo,tipo') && typeof t.simbolo === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(t.simbolo)
    && (t.tipo === 'predicado' || t.tipo === 'constante') && Number.isInteger(t.aridade) && (t.aridade as number) >= 0 && (t.aridade as number) <= 4 && typeof t.leitura === 'string' && t.leitura.length <= 80
}
export function validarPropostaConferir(x: unknown): PropostaParaConferir {
  const formula = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 1000
  if (!objetoSimples(x, 'classe,conclusao,premissas,vocabulario') || !Array.isArray(x.vocabulario) || x.vocabulario.length < 1 || x.vocabulario.length > 40
      || !x.vocabulario.every(termoValido) || !Array.isArray(x.premissas) || x.premissas.length < 1 || x.premissas.length > 10 || !x.premissas.every(formula)
      || !formula(x.conclusao) || !(x.classe === null || CLASSES.includes(x.classe as Classe))) throw new ErroOllama(400, 'invalido')
  return { vocabulario: (x.vocabulario as Termo[]).map(({ simbolo, tipo, aridade, leitura }) => ({ simbolo, tipo, aridade, leitura })), premissas: x.premissas as string[], conclusao: x.conclusao as string, classe: x.classe as Classe | null }
}

/** O pedido da ligação que falta: as fórmulas do salto (como na conferência, sem classe) e o cenário que o Z3 achou. */
export function validarPedidoPonte(x: unknown): ArgumentoFormal {
  if (!objetoSimples(x, 'cenario,conclusao,premissas,vocabulario') || !Array.isArray(x.cenario) || x.cenario.length > 20
      || !x.cenario.every((c) => typeof c === 'string' && c.length <= 300)) throw new ErroOllama(400, 'invalido')
  const { vocabulario, premissas, conclusao } = validarPropostaConferir({ vocabulario: x.vocabulario, premissas: x.premissas, conclusao: x.conclusao, classe: null })
  return { vocabulario, premissas, conclusao, cenario: x.cenario as string[] }
}

/**
 * O porteiro da IA local: o modelo só atende quem tem uma sessão aberta pela conta dona deste serviço. A sessão nasce de
 * um desafio do serviço assinado pela chave da conta (COSMOS/IA/SESSAO/V1), o que exige a senha: outro programa ou outro
 * usuário do computador, mesmo chamando 127.0.0.1, não usa o modelo. A primeira conta que se liga vira a dona (gravada em
 * `arquivoDono`); trocar de dona é abrir o serviço com --novo-dono. A sessão cai com 10 minutos parada, como a conta.
 */
export interface OpcoesSessaoIA { arquivoDono: string; novoDono?: boolean; ociosoMs?: number }
export function criarPorteiroIA(o: OpcoesSessaoIA) {
  const ocioso = o.ociosoMs ?? 10 * 60 * 1000
  let dono: string | null = null
  if (!o.novoDono && existsSync(o.arquivoDono)) {
    try {
      const j = JSON.parse(readFileSync(o.arquivoDono, 'utf8')) as { formato?: string; pubkey?: string }
      if (j.formato === 'cosmos-ia-dono-v1' && typeof j.pubkey === 'string' && /^(02|03)[a-f0-9]{64}$/.test(j.pubkey)) dono = j.pubkey
    } catch { /* arquivo estragado: ninguém é dono até alguém se ligar */ }
  }
  const desafios = new Map<string, number>(), sessoes = new Map<string, number>()
  const limpar = () => { const agora = Date.now(); for (const [d, ate] of desafios) if (ate < agora) desafios.delete(d); for (const [t, ultimo] of sessoes) if (agora - ultimo >= ocioso) sessoes.delete(t) }
  return {
    desafio() {
      limpar()
      while (desafios.size >= 20) desafios.delete(desafios.keys().next().value!)
      const d = randomBytes(32).toString('hex')
      desafios.set(d, Date.now() + 60_000)
      return { desafio: d, ligada: dono !== null }
    },
    abrir(x: unknown) {
      limpar()
      if (!objetoSimples(x, 'assinatura,desafio,pubkey') || typeof x.desafio !== 'string' || typeof x.pubkey !== 'string' || typeof x.assinatura !== 'string') throw new ErroOllama(400, 'invalido')
      if (!desafios.delete(x.desafio)) throw new ErroOllama(401, 'sem-sessao')
      if (!verificarMensagemLocalTeste(x.pubkey, 'COSMOS/IA/SESSAO/V1', x.desafio, x.assinatura)) throw new ErroOllama(401, 'sem-sessao')
      if (dono !== null && x.pubkey !== dono) throw new ErroOllama(403, 'outra-conta')
      if (dono === null) {
        dono = x.pubkey
        mkdirSync(dirname(o.arquivoDono), { recursive: true })
        writeFileSync(o.arquivoDono, JSON.stringify({ formato: 'cosmos-ia-dono-v1', pubkey: dono, ligadoEm: new Date().toISOString() }) + '\n')
      }
      while (sessoes.size >= 8) sessoes.delete(sessoes.keys().next().value!)
      const token = randomBytes(32).toString('hex')
      sessoes.set(token, Date.now())
      return { token, ociosoMs: ocioso }
    },
    /** Lança 401 sem uma sessão viva no cabeçalho X-Cosmos-Sessao; a viva ganha mais tempo. */
    conferir(req: IncomingMessage) {
      limpar()
      const h = req.headers['x-cosmos-sessao']
      if (typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h)) throw new ErroOllama(401, 'sem-sessao')
      for (const t of sessoes.keys()) if (timingSafeEqual(Buffer.from(t), Buffer.from(h))) { sessoes.set(t, Date.now()); return }
      throw new ErroOllama(401, 'sem-sessao')
    },
  }
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
 * (a tradução cega CEGO_FORMALIZACAO sobre as regras de PROMPT_FORMALIZACAO, saída presa ao esquema de cada passo,
 * temperatura 0; a classe fica para o Z3): o navegador manda premissas e conclusão, nunca mensagens, modelo ou destino.
 * O texto não sai do aparelho. Um pedido de cada vez (duas chamadas ao modelo, mais o reparo quando precisa).
 * Não depende da sessão P0 (15 minutos, feita para a chave do Groq): aqui não há segredo, e a rota vale enquanto o
 * serviço local estiver aberto, presa à mesma origem e ao marcador da ponte.
 *
 * `nuvem` (só com --groq): o mesmo pedido, as mesmas regras e a mesma tradução cega, pelo modelo grande no Groq, quando a
 * pessoa liga essa opção na Conversa. Aí o texto sai do aparelho (para o Groq); o Z3 continua decidindo aqui.
 */
export function criarControleOllama(opcoes: { modelo?: string; buscar?: typeof fetch; prazoMs?: number; conferidor?: ConferidorZ3; sessao?: OpcoesSessaoIA
  nuvem?: { executar: (p: PedidoGroq) => Promise<{ conteudo: string; usage: { prompt_tokens: number; completion_tokens: number } }>; modelo: ModeloGroq } }) {
  const modelo = opcoes.modelo ?? MODELO_OLLAMA_PADRAO
  // a tradução cega: as premissas sem a conclusão, depois a conclusão só com o vocabulário (formalizacao-v1.md §8b)
  const premissas = criarAdaptadorOllama({ modelo, formato: ESQUEMA_PREMISSAS, temperatura: 0, semente: 0, contexto: 4096, buscar: opcoes.buscar, prazoMs: opcoes.prazoMs ?? 300_000 })
  const conclusao = criarAdaptadorOllama({ modelo, formato: ESQUEMA_CONCLUSAO, temperatura: 0, semente: 0, contexto: 4096, buscar: opcoes.buscar, prazoMs: opcoes.prazoMs ?? 300_000 })
  // com o vocabulário corrigido pela pessoa, ele fica fixo nas duas chamadas
  const traduzir = (t: { premissas: string[]; conclusao: string; vocabulario?: Termo[] }) => formalizarCego(premissas, conclusao, t, t.vocabulario ?? null, EXEMPLOS)
  const nuvem = opcoes.nuvem
  const porteiro = opcoes.sessao ? criarPorteiroIA(opcoes.sessao) : null
  // no Groq não há esquema preso à saída: o pedido já manda responder só com o objeto JSON, e quem lê confere
  const perguntarNuvem = nuvem && (async (messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) => {
    const r = await nuvem.executar({ model: nuvem.modelo, messages, max_tokens: 4096, temperature: 0 })
    return { conteudo: r.conteudo, prompt: r.usage.prompt_tokens, completion: r.usage.completion_tokens }
  })
  // a ligação que falta (ponte.ts): o modelo propõe, o Z3 confere
  const ligacao = criarAdaptadorOllama({ modelo, formato: ESQUEMA_PONTE, temperatura: 0, semente: 0, contexto: 4096, buscar: opcoes.buscar, prazoMs: opcoes.prazoMs ?? 300_000 })
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
      prompt: `${CEGO_FORMALIZACAO} (${PROMPT_FORMALIZACAO})`, extrair, traduzir,
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
          enviar(res, 200, { formato: 'cosmos-ollama-v1', estado: 'pronto', ...(await descreverModeloOllama(modelo, opcoes.buscar)), prompt: PROMPT_FORMALIZACAO, cego: CEGO_FORMALIZACAO, saida: SAIDA_FORMALIZACAO, reparo: REPARO_FORMALIZACAO, extrator: EXTRATOR, nuvem: nuvem?.modelo ?? null, sessao: porteiro ? 'exigida' : 'livre' })
        } catch (e) {
          enviar(res, 200, { formato: 'cosmos-ollama-v1', estado: /não está instalado/.test((e as Error).message) ? 'sem-modelo' : 'indisponivel', modelo })
        }
        return
      }
      if (rota === 'ollama/desafio') {
        if (!porteiro) throw new ErroOllama(404, 'invalido')
        enviar(res, 200, { formato: 'cosmos-ia-desafio-v1', ...porteiro.desafio() })
        return
      }
      if (rota === 'ollama/sessao') {
        if (!porteiro) throw new ErroOllama(404, 'invalido')
        enviar(res, 200, { formato: 'cosmos-ia-sessao-v1', ...porteiro.abrir(await lerCorpo(req, 4096)) })
        return
      }
      // daqui em diante, tudo usa o modelo ou mostra o que ele fez: só com a sessão da conta dona
      porteiro?.conferir(req)
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
        if (rota === 'ollama/ponte') {
          // a ligação que falta num salto: o modelo e o Z3 se revezam na memória
          const z3 = opcoes.conferidor
          if (!z3) throw new ErroOllama(503, 'indisponivel')
          const a = validarPedidoPonte(await lerCorpo(req))
          const r = await buscarPonte(ligacao, async (ps, c) => {
            const k = await z3.conferir({ vocabulario: a.vocabulario, premissas: ps, conclusao: c, classe: null })
            if (k.classeZ3) return k.classeZ3
            throw new Error(k.motivo || 'o Z3 não decidiu')
          }, a, { antesDoModelo: () => z3.parar(), antesDoZ3: () => descarregarModeloOllama(modelo, opcoes.buscar).catch(() => undefined) })
          if (encerrado) throw new ErroOllama(503, 'indisponivel')
          enviar(res, 200, { formato: 'cosmos-ollama-ponte-v1', versao: PONTE, ...r })
          return
        }
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
        if (texto.nuvem && !perguntarNuvem) throw new ErroOllama(503, 'sem-nuvem')
        opcoes.conferidor?.parar()
        const inicio = Date.now()
        // em cada passo, a resposta que não se lê, ou com premissa a mais ou a menos, volta uma vez ao modelo com o erro
        const r = texto.nuvem && perguntarNuvem ? await formalizarCego(perguntarNuvem, perguntarNuvem, texto, texto.vocabulario ?? null, EXEMPLOS) : await traduzir(texto)
        if (encerrado) throw new ErroOllama(503, 'indisponivel')
        enviar(res, 200, { formato: 'cosmos-ollama-resposta-v1', modelo: texto.nuvem && nuvem ? nuvem.modelo : modelo, conteudo: r.conteudo, prompt_tokens: r.prompt, completion_tokens: r.completion, ms: Date.now() - inicio, reparo: r.reparo })
      } finally { pendente = false }
    } catch (e) {
      const erro = e instanceof ErroOllama ? e : e instanceof ErroGroq && e.codigo === 'provedor-recusou' ? new ErroOllama(422, 'provedor-recusou') : new ErroOllama(503, 'indisponivel')
      enviar(res, erro.status, { erro: erro.codigo })
    }
  }
  return Object.freeze({ tratar, encerrar() { encerrado = true; opcoes.conferidor?.parar() } })
}
