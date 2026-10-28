import type { IncomingMessage, ServerResponse } from 'node:http'
import { criarAdaptadorOllama, descreverModeloOllama } from './provedores/ollama'
import { ESQUEMA_RESPOSTA, mensagensDeFormalizacao, PROMPT_FORMALIZACAO, SAIDA_FORMALIZACAO } from '../motor/formalizacao'
import type { Item } from '../motor/avaliacao'
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

/**
 * A formalização pelo Ollama local, servida pela ponte (rotas `ollama/estado` e `ollama`). Só o pedido fixo
 * (formalizacao-v1, saída presa ao esquema, temperatura 0): o navegador manda premissas e conclusão, nunca mensagens,
 * modelo ou destino. O texto não sai do aparelho. Uma chamada de cada vez; na CPU, cada uma leva cerca de um minuto.
 */
export function criarControleOllama(opcoes: { modelo?: string; sessaoValida: () => Promise<boolean>; buscar?: typeof fetch; prazoMs?: number }) {
  const modelo = opcoes.modelo ?? MODELO_OLLAMA_PADRAO
  const perguntar = criarAdaptadorOllama({ modelo, formato: ESQUEMA_RESPOSTA, temperatura: 0, semente: 0, contexto: 4096, buscar: opcoes.buscar, prazoMs: opcoes.prazoMs ?? 300_000 })
  let pendente = false, encerrado = false
  const enviar = (res: ServerResponse, status: number, v: unknown) => {
    if (res.destroyed || res.writableEnded) return
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' })
    res.end(JSON.stringify(v))
  }
  const lerCorpo = (req: IncomingMessage) => new Promise<unknown>((resolve, reject) => {
    const partes: Buffer[] = []; let bytes = 0
    const timer = setTimeout(() => { limpar(); reject(new ErroOllama(408, 'invalido')) }, 5000)
    const limpar = () => { clearTimeout(timer); req.off('data', data); req.off('end', end) }
    const data = (b: Buffer) => {
      bytes += b.length
      if (bytes > 16384) { limpar(); req.pause(); reject(new ErroOllama(413, 'invalido')); return }
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
      if (encerrado || !(await opcoes.sessaoValida())) throw new ErroOllama(401, 'sessao-expirada')
      if (rota === 'ollama/estado') {
        try {
          enviar(res, 200, { formato: 'cosmos-ollama-v1', estado: 'pronto', ...(await descreverModeloOllama(modelo, opcoes.buscar)), prompt: PROMPT_FORMALIZACAO, saida: SAIDA_FORMALIZACAO })
        } catch (e) {
          enviar(res, 200, { formato: 'cosmos-ollama-v1', estado: /não está instalado/.test((e as Error).message) ? 'sem-modelo' : 'indisponivel', modelo })
        }
        return
      }
      if (pendente) throw new ErroOllama(429, 'ocupado')
      pendente = true
      try {
        const texto = validarTextoFormalizacao(await lerCorpo(req))
        const inicio = Date.now()
        const r = await perguntar(mensagensDeFormalizacao(texto, null, EXEMPLOS))
        if (encerrado) throw new ErroOllama(503, 'indisponivel')
        enviar(res, 200, { formato: 'cosmos-ollama-resposta-v1', modelo, conteudo: r.conteudo, prompt_tokens: r.prompt, completion_tokens: r.completion, ms: Date.now() - inicio })
      } finally { pendente = false }
    } catch (e) {
      const erro = e instanceof ErroOllama ? e : new ErroOllama(503, 'indisponivel')
      enviar(res, erro.status, { erro: erro.codigo })
    }
  }
  return Object.freeze({ tratar, encerrar() { encerrado = true } })
}
