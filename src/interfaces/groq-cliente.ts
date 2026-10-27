import { validarConfigGroq, validarSnapshotGroq, type ConfiguracaoGroq, type ModeloGroq } from '../integracoes/groq-contratos'
import { ErroIntegracoes } from './integracoes-cliente'

export function criarClienteGroq(origem: string, buscar: typeof fetch = fetch) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origem) || new URL(origem).origin !== origem) throw new ErroIntegracoes('sem-servico')
  async function requisicao(rota: 'estado' | 'configuracao' | 'testar', metodo: 'GET' | 'PUT' | 'POST', corpo?: unknown, signal?: AbortSignal) {
    const controle = new AbortController(), abortar = () => controle.abort()
    if (signal?.aborted) controle.abort()
    else signal?.addEventListener('abort', abortar, { once: true })
    const timer = setTimeout(abortar, 24000)
    try {
      const r = await buscar(`${origem}/cosmos/__p0/groq/${rota}`, { method: metodo,
        headers: { 'X-Cosmos-P0': '1', Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: controle.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin' })
      if (!r.ok) throw new ErroIntegracoes(r.status === 401 ? 'sessao-expirada' : r.status === 409 ? 'conflito' : r.status === 429 ? 'limite' : r.status === 400 ? 'invalido' : 'sem-servico')
      if (!r.body || !r.headers.get('content-type')?.startsWith('application/json')) throw new ErroIntegracoes('invalido')
      const leitor = r.body.getReader(), partes: Uint8Array[] = []; let n = 0
      try {
        for (;;) {
          const b = await leitor.read(); if (b.done) break
          n += b.value.length; if (n > 131072) { await leitor.cancel(); throw new ErroIntegracoes('invalido') }
          partes.push(b.value)
        }
      } finally { leitor.releaseLock() }
      const bytes = new Uint8Array(n); let pos = 0
      for (const b of partes) { bytes.set(b, pos); pos += b.length }
      return validarSnapshotGroq(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
    } catch (e) { throw e instanceof ErroIntegracoes ? e : new ErroIntegracoes('indisponivel') }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abortar) }
  }
  /**
   * Um pedido de conversa pela ponte local (rota groq): a chave fica no processo Node, nunca aqui. Devolve só o texto
   * da resposta e o consumo, que a ponte já reconstrói sem campos do provedor.
   */
  async function perguntar(pedido: { model: ModeloGroq; messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; max_tokens: number; temperature: number }, signal?: AbortSignal) {
    const controle = new AbortController(), abortar = () => controle.abort()
    if (signal?.aborted) controle.abort()
    else signal?.addEventListener('abort', abortar, { once: true })
    const timer = setTimeout(abortar, 30000)
    try {
      const r = await buscar(`${origem}/cosmos/__p0/groq`, { method: 'POST', headers: { 'X-Cosmos-P0': '1', Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(pedido), signal: controle.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin' })
      if (!r.ok) throw new ErroIntegracoes(r.status === 401 ? 'sessao-expirada' : r.status === 409 ? 'conflito' : r.status === 429 ? 'limite' : r.status === 400 ? 'invalido' : 'sem-servico')
      if (!r.headers.get('content-type')?.startsWith('application/json')) throw new ErroIntegracoes('invalido')
      const texto = await r.text()
      if (texto.length > 131072) throw new ErroIntegracoes('invalido')
      const o = JSON.parse(texto) as { formato?: unknown; conteudo?: unknown; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }
      if (o.formato !== 'cosmos-groq-resposta-p1-v1' || typeof o.conteudo !== 'string' || !Number.isSafeInteger(o.usage?.prompt_tokens) || !Number.isSafeInteger(o.usage?.completion_tokens)) throw new ErroIntegracoes('invalido')
      return { conteudo: o.conteudo, prompt_tokens: o.usage!.prompt_tokens as number, completion_tokens: o.usage!.completion_tokens as number }
    } catch (e) { throw e instanceof ErroIntegracoes ? e : new ErroIntegracoes('indisponivel') }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abortar) }
  }
  return Object.freeze({
    perguntar,
    carregar: (s?: AbortSignal) => requisicao('estado', 'GET', undefined, s),
    salvar: (c: ConfiguracaoGroq, s?: AbortSignal) => requisicao('configuracao', 'PUT', validarConfigGroq(c), s),
    testar: (s?: AbortSignal) => requisicao('testar', 'POST', undefined, s),
  })
}
