import { ErroIntegracoes } from './integracoes-cliente'
import { CLASSES, type Classe, type Termo } from '../motor/avaliacao'

export interface EstadoOllama { estado: 'pronto' | 'sem-modelo' | 'indisponivel'; modelo: string; digest?: string; ollama?: string }

/**
 * A formalização pelo Ollama local, pela ponte do serviço local (rotas ollama/estado e ollama). O navegador manda só
 * premissas e conclusão; o pedido, o modelo e as opções ficam no processo Node.
 */
export function criarClienteOllama(origem: string, buscar: typeof fetch = fetch) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origem) || new URL(origem).origin !== origem) throw new ErroIntegracoes('sem-servico')
  async function chamar(rota: 'ollama/estado' | 'ollama' | 'ollama/conferir', corpo: unknown, prazoMs: number, signal?: AbortSignal) {
    const controle = new AbortController(), abortar = () => controle.abort()
    if (signal?.aborted) controle.abort()
    else signal?.addEventListener('abort', abortar, { once: true })
    const timer = setTimeout(abortar, prazoMs)
    try {
      const r = await buscar(`${origem}/cosmos/__p0/${rota}`, { method: corpo === undefined ? 'GET' : 'POST',
        headers: { 'X-Cosmos-P0': '1', Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: controle.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin' })
      if (!r.ok) throw new ErroIntegracoes(r.status === 401 ? 'sessao-expirada' : r.status === 429 ? 'limite' : r.status === 400 ? 'invalido' : 'sem-servico')
      if (!r.headers.get('content-type')?.startsWith('application/json')) throw new ErroIntegracoes('invalido')
      const texto = await r.text()
      if (texto.length > 131072) throw new ErroIntegracoes('invalido')
      return JSON.parse(texto) as Record<string, unknown>
    } catch (e) { throw e instanceof ErroIntegracoes ? e : new ErroIntegracoes('indisponivel') }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abortar) }
  }
  return Object.freeze({
    async carregar(signal?: AbortSignal): Promise<EstadoOllama> {
      const o = await chamar('ollama/estado', undefined, 15000, signal)
      if (o.formato !== 'cosmos-ollama-v1' || !['pronto', 'sem-modelo', 'indisponivel'].includes(o.estado as string) || typeof o.modelo !== 'string') throw new ErroIntegracoes('invalido')
      return { estado: o.estado as EstadoOllama['estado'], modelo: o.modelo, ...(typeof o.digest === 'string' ? { digest: o.digest } : {}), ...(typeof o.ollama === 'string' ? { ollama: o.ollama } : {}) }
    },
    /** Na CPU, uma proposta leva cerca de um minuto; o prazo aqui é o mesmo da ponte. */
    async formalizar(texto: { premissas: string[]; conclusao: string }, signal?: AbortSignal) {
      const o = await chamar('ollama', texto, 310000, signal)
      if (o.formato !== 'cosmos-ollama-resposta-v1' || typeof o.conteudo !== 'string' || !Number.isSafeInteger(o.prompt_tokens) || !Number.isSafeInteger(o.completion_tokens)) throw new ErroIntegracoes('invalido')
      return { conteudo: o.conteudo, prompt_tokens: o.prompt_tokens as number, completion_tokens: o.completion_tokens as number }
    },
    /** O modo automático: o Z3 confere se a classe que o modelo disse é a das fórmulas dele (a primeira abre o Z3). */
    async conferir(p: { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }, signal?: AbortSignal) {
      const o = await chamar('ollama/conferir', { vocabulario: p.vocabulario, premissas: p.premissas, conclusao: p.conclusao, classe: p.classe }, 120000, signal)
      if (o.formato !== 'cosmos-ollama-conferencia-v1' || typeof o.aceita !== 'boolean' || typeof o.motivo !== 'string' || !(o.classe_z3 === null || CLASSES.includes(o.classe_z3 as Classe))) throw new ErroIntegracoes('invalido')
      return { classeZ3: o.classe_z3 as Classe | null, aceita: o.aceita, motivo: o.motivo }
    },
  })
}
