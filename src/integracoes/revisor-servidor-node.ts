// O revisor de planos como serviço para clientes (especificacao/revisor-v1.md §6). Outra peça, não o serviço local:
// aquele aceita só a origem 127.0.0.1 e confia em quem está no computador; este atende pela rede, com uma chave por
// cliente. O que ele guarda: as contas (nome e o SHA-256 da chave, nunca a chave), a fila e, por até `ttlMs`, o
// relatório de cada revisão. O texto do plano sai da memória assim que a revisão termina; os registros não têm conteúdo.
// HTTPS fica com um proxy reverso na frente (Caddy, nginx): este processo escuta em 127.0.0.1 por padrão.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { criarAdaptadorOllama, descarregarModeloOllama } from './provedores/ollama'
import { criarConferidorZ3 } from './ollama-node'
import { CEGO_FORMALIZACAO, ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, formalizarCego, PROMPT_FORMALIZACAO } from '../motor/formalizacao'
import { ESQUEMA_EXTRACAO, MAX_TEXTO_REVISOR, revisarPlano, type RelatorioRevisor } from '../motor/revisor'
import type { Item } from '../motor/avaliacao'
import exemplosTexto from '../../avaliacao/exemplos-publicos-v1.jsonl?raw'

export interface Conta { id: string; nome: string; hash: string; criadaEm: string; limiteDia: number }
type Progresso = (fase: string, feito: number, total: number) => void
export type Revisar = (texto: string, progresso: Progresso) => Promise<RelatorioRevisor>

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
/** Uma chave nova: mostrada uma vez para o cliente; o servidor guarda só o hash. */
export function criarChave(): { chave: string; hash: string } {
  const chave = `cosmos_${randomBytes(32).toString('base64url')}`
  return { chave, hash: sha256(chave) }
}

/** As contas num arquivo JSON fora do Git; relido a cada pedido, para a conta nova ou removida valer sem reiniciar. */
export function arquivoDeContas(caminho: string) {
  const ler = (): Conta[] => (existsSync(caminho) ? JSON.parse(readFileSync(caminho, 'utf8')) as Conta[] : [])
  const gravar = (cs: Conta[]) => { mkdirSync(dirname(caminho), { recursive: true }); writeFileSync(caminho, JSON.stringify(cs, null, 2) + '\n', { mode: 0o600 }) }
  return {
    ler,
    nova(nome: string, limiteDia = 20) {
      if (!/^[\p{L}\p{N} .,&()-]{1,80}$/u.test(nome)) throw new Error('nome de conta inválido')
      const { chave, hash } = criarChave(), cs = ler()
      const conta: Conta = { id: randomBytes(6).toString('hex'), nome, hash, criadaEm: new Date().toISOString(), limiteDia }
      gravar([...cs, conta])
      return { conta, chave }
    },
    remover(id: string) { const cs = ler(); gravar(cs.filter((c) => c.id !== id)); return cs.length !== cs.filter((c) => c.id !== id).length },
  }
}

interface Trabalho {
  id: string; conta: string; criado: number; texto: string | null
  estado: 'na-fila' | 'rodando' | 'pronto' | 'erro'; fase: string; feito: number; total: number; fim?: number
  relatorio?: RelatorioRevisor; erro?: string
}
export interface OpcoesServidorRevisor {
  contas: () => Conta[]
  revisar: Revisar
  /** o relatório pronto fica disponível por este tempo (padrão: 24 h) */
  ttlMs?: number
  /** revisões esperando ao mesmo tempo, somando todas as contas (padrão: 20) */
  maxFila?: number
  /** revisões de uma conta ainda não terminadas (padrão: 2) */
  maxPorConta?: number
  agora?: () => number
  registrar?: (linha: Record<string, unknown>) => void
}

class ErroHttp extends Error { constructor(readonly status: number, readonly codigo: string) { super(codigo) } }

/** O tratamento HTTP do revisor. As rotas: GET /api/saude, POST /api/revisoes, GET e DELETE /api/revisoes/:id. */
export function criarServicoRevisor(o: OpcoesServidorRevisor) {
  const agora = o.agora ?? Date.now, ttl = o.ttlMs ?? 24 * 3600_000, maxFila = o.maxFila ?? 20, maxPorConta = o.maxPorConta ?? 2
  const registrar = o.registrar ?? ((l) => console.log(JSON.stringify(l)))
  const trabalhos = new Map<string, Trabalho>(), fila: string[] = [], usoDia = new Map<string, { dia: string; n: number }>()
  const falhasPorIp = new Map<string, { minuto: number; n: number }>()
  let rodando = false, encerrado = false

  const limpar = () => {
    for (const [id, t] of trabalhos) if (t.fim !== undefined && agora() - t.fim > ttl) trabalhos.delete(id)
  }
  const proximo = async () => {
    if (rodando || encerrado) return
    const id = fila.shift(); if (!id) return
    const t = trabalhos.get(id); if (!t || t.texto === null) return void proximo()
    rodando = true; t.estado = 'rodando'
    const inicio = agora()
    try {
      t.relatorio = await o.revisar(t.texto, (fase, feito, total) => Object.assign(t, { fase, feito, total }))
      t.estado = 'pronto'
    } catch (e) { t.estado = 'erro'; t.erro = (e as Error).message.slice(0, 300) }
    t.texto = null; t.fim = agora(); rodando = false
    registrar({ evento: 'revisao', conta: t.conta, id: t.id, estado: t.estado, ms: t.fim - inicio, conclusoes: t.relatorio?.argumentos.length ?? 0 })
    void proximo()
  }

  const autenticar = (req: IncomingMessage): Conta => {
    const ip = req.socket.remoteAddress ?? '?', minuto = Math.floor(agora() / 60_000)
    const f = falhasPorIp.get(ip)
    if (f && f.minuto === minuto && f.n >= 20) throw new ErroHttp(429, 'tentativas-demais')
    const m = /^Bearer (cosmos_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')
    const hash = m ? Buffer.from(sha256(m[1]), 'hex') : null
    const conta = hash ? o.contas().find((c) => /^[0-9a-f]{64}$/.test(c.hash) && timingSafeEqual(Buffer.from(c.hash, 'hex'), hash)) : undefined
    if (!conta) {
      falhasPorIp.set(ip, f && f.minuto === minuto ? { minuto, n: f.n + 1 } : { minuto, n: 1 })
      throw new ErroHttp(401, 'chave-invalida')
    }
    return conta
  }
  const lerCorpo = (req: IncomingMessage) => new Promise<unknown>((resolve, reject) => {
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) { reject(new ErroHttp(415, 'tipo')); return }
    const partes: Buffer[] = []; let bytes = 0
    req.on('data', (b: Buffer) => { bytes += b.length; if (bytes > 131072) { reject(new ErroHttp(413, 'grande-demais')); req.destroy() } else partes.push(b) })
    req.once('end', () => { try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes)))) } catch { reject(new ErroHttp(400, 'json')) } })
    req.once('error', () => reject(new ErroHttp(400, 'corpo')))
  })
  const enviar = (res: ServerResponse, status: number, v: unknown) => {
    if (res.headersSent) return
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    res.end(JSON.stringify(v))
  }
  const publico = (t: Trabalho) => ({ id: t.id, estado: t.estado, fase: t.fase, feito: t.feito, total: t.total,
    ...(t.estado === 'na-fila' ? { posicao: fila.indexOf(t.id) + 1 } : {}), ...(t.relatorio ? { relatorio: t.relatorio } : {}), ...(t.erro ? { erro: t.erro } : {}),
    ...(t.fim !== undefined ? { expira_em: new Date(t.fim + ttl).toISOString() } : {}) })

  async function tratar(req: IncomingMessage, res: ServerResponse) {
    try {
      if (encerrado) throw new ErroHttp(503, 'encerrado')
      limpar()
      const url = new URL(req.url ?? '/', 'http://local'), caminho = url.pathname
      if (caminho === '/api/saude' && req.method === 'GET') { enviar(res, 200, { ok: true, fila: fila.length, rodando }); return }
      const conta = autenticar(req)
      if (caminho === '/api/revisoes' && req.method === 'POST') {
        const corpo = await lerCorpo(req) as { texto?: unknown }
        if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo) || Object.keys(corpo).join() !== 'texto' || typeof corpo.texto !== 'string'
            || !corpo.texto.trim() || corpo.texto.length > MAX_TEXTO_REVISOR) throw new ErroHttp(400, 'texto-invalido')
        const dia = new Date(agora()).toISOString().slice(0, 10), uso = usoDia.get(conta.id)
        const usados = uso?.dia === dia ? uso.n : 0
        if (usados >= conta.limiteDia) throw new ErroHttp(429, 'limite-do-dia')
        if ([...trabalhos.values()].filter((t) => t.conta === conta.id && (t.estado === 'na-fila' || t.estado === 'rodando')).length >= maxPorConta) throw new ErroHttp(429, 'revisoes-em-andamento')
        if (fila.length >= maxFila) throw new ErroHttp(503, 'fila-cheia')
        const t: Trabalho = { id: randomBytes(16).toString('hex'), conta: conta.id, criado: agora(), texto: corpo.texto, estado: 'na-fila', fase: 'na-fila', feito: 0, total: 0 }
        trabalhos.set(t.id, t); fila.push(t.id); usoDia.set(conta.id, { dia, n: usados + 1 })
        registrar({ evento: 'pedido', conta: conta.id, id: t.id, caracteres: corpo.texto.length })
        enviar(res, 202, publico(t))
        void proximo()
        return
      }
      const m = /^\/api\/revisoes\/([0-9a-f]{32})$/.exec(caminho)
      const t = m ? trabalhos.get(m[1]) : undefined
      // a revisão de outra conta responde como se não existisse
      if (!m || !t || t.conta !== conta.id) throw new ErroHttp(404, 'nao-encontrada')
      if (req.method === 'GET') { enviar(res, 200, publico(t)); return }
      if (req.method === 'DELETE') {
        if (t.estado === 'rodando') throw new ErroHttp(409, 'rodando')
        trabalhos.delete(t.id); const i = fila.indexOf(t.id); if (i >= 0) fila.splice(i, 1)
        registrar({ evento: 'apagada', conta: conta.id, id: t.id })
        enviar(res, 200, { id: t.id, apagada: true }); return
      }
      throw new ErroHttp(405, 'metodo')
    } catch (e) {
      const erro = e instanceof ErroHttp ? e : new ErroHttp(500, 'interno')
      enviar(res, erro.status, { erro: erro.codigo })
    }
  }
  return {
    tratar,
    /** para os testes: quantas revisões ainda guardam o texto do plano */
    textosGuardados: () => [...trabalhos.values()].filter((t) => t.texto !== null).length,
    encerrar() { encerrado = true },
  }
}

/** O revisor de verdade: o Ollama local (extrator e tradução) e o Z3 numa thread, como no serviço local. */
export function revisorOllama(opcoes: { modelo?: string; trabalhadorZ3: URL }): Revisar {
  const modelo = opcoes.modelo ?? 'qwen3:4b'
  const exemplos = exemplosTexto.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
  const premissas = criarAdaptadorOllama({ modelo, formato: ESQUEMA_PREMISSAS, temperatura: 0, semente: 0, contexto: 4096 })
  const conclusao = criarAdaptadorOllama({ modelo, formato: ESQUEMA_CONCLUSAO, temperatura: 0, semente: 0, contexto: 4096 })
  const extrair = criarAdaptadorOllama({ modelo, formato: ESQUEMA_EXTRACAO, temperatura: 0, semente: 0, contexto: 8192 })
  const conferidor = criarConferidorZ3(opcoes.trabalhadorZ3)
  return (texto, progresso) => {
    conferidor.parar()
    return revisarPlano(texto, {
      prompt: `${CEGO_FORMALIZACAO} (${PROMPT_FORMALIZACAO})`, extrair, progresso,
      traduzir: (t) => formalizarCego(premissas, conclusao, t, null, exemplos),
      descarregar: () => descarregarModeloOllama(modelo),
      classificar: async (p) => {
        const c = await conferidor.conferir({ ...p, classe: null })
        if (c.classeZ3) return c.classeZ3
        throw new Error(c.motivo || 'o Z3 não decidiu')
      },
    })
  }
}

export async function iniciarServidorRevisor(o: { host: string; porta: number; contas: string; modelo?: string; trabalhadorZ3: URL }) {
  const contas = arquivoDeContas(o.contas)
  const servico = criarServicoRevisor({ contas: contas.ler, revisar: revisorOllama({ modelo: o.modelo, trabalhadorZ3: o.trabalhadorZ3 }) })
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => { void servico.tratar(req, res) })
  server.requestTimeout = 30_000; server.headersTimeout = 10_000; server.maxConnections = 64
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(o.porta, o.host, resolve) })
  return { encerrar: () => new Promise<void>((resolve) => { servico.encerrar(); server.close(() => resolve()); server.closeAllConnections() }) }
}
