// O Ollama local, para o piloto e a nota oficial (especificacao/formalizacao-v1.md). Só fala com 127.0.0.1: o conjunto
// fechado não pode sair do aparelho. Usa a API nativa (/api/chat), que é a que aceita desligar o "modo pensando" do
// Qwen3 (`think: false`) e prender a saída a um esquema JSON (`format`); a compatível com OpenAI não aceita os dois.

const BASE = 'http://127.0.0.1:11434'

export interface OpcoesOllama {
  modelo: string
  /** esquema JSON da resposta; sem ele, texto livre */
  formato?: object
  temperatura?: number
  semente?: number
  /** janela de contexto fixa: o padrão do Ollama muda entre versões, e a medição tem de se repetir */
  contexto?: number
  prazoMs?: number
  buscar?: typeof fetch
}
export interface MensagemOllama { role: 'system' | 'user' | 'assistant'; content: string }
export interface RespostaOllama { conteudo: string; prompt: number; completion: number }

async function pedir(buscar: typeof fetch, caminho: string, corpo: unknown, prazoMs: number): Promise<unknown> {
  const controle = new AbortController(), timer = setTimeout(() => controle.abort(), prazoMs)
  try {
    const r = await buscar(BASE + caminho, corpo === undefined ? { signal: controle.signal, redirect: 'error' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: controle.signal, redirect: 'error' })
    if (!r.ok) throw new Error(`Ollama respondeu ${r.status}`)
    return await r.json()
  } catch (e) {
    if (controle.signal.aborted) throw new Error(`Ollama não respondeu em ${prazoMs / 1000} s`)
    if (e instanceof TypeError) throw new Error(`o Ollama não está rodando em ${BASE} (abra o Ollama ou rode "ollama serve")`)
    throw e
  } finally { clearTimeout(timer) }
}

/** O pedido de conversa ao Ollama local, com as opções fixas de uma medição (temperatura, semente, contexto). */
export function criarAdaptadorOllama(o: OpcoesOllama) {
  const buscar = o.buscar ?? fetch
  const opcoes = { temperature: o.temperatura ?? 0, seed: o.semente ?? 0, num_ctx: o.contexto ?? 4096 }
  return async (messages: MensagemOllama[]): Promise<RespostaOllama> => {
    const b = await pedir(buscar, '/api/chat', { model: o.modelo, messages, stream: false, think: false, ...(o.formato ? { format: o.formato } : {}), options: opcoes }, o.prazoMs ?? 300_000) as
      { message?: { content?: unknown }; prompt_eval_count?: number; eval_count?: number }
    if (typeof b.message?.content !== 'string') throw new Error('o Ollama não devolveu a mensagem')
    return { conteudo: b.message.content, prompt: b.prompt_eval_count ?? 0, completion: b.eval_count ?? 0 }
  }
}

/**
 * O que identifica o modelo numa medição: o digest (SHA-256 do manifesto, que fixa os pesos) e a versão do Ollama.
 * Lança se o modelo não está instalado.
 */
export async function descreverModeloOllama(modelo: string, buscar: typeof fetch = fetch): Promise<{ modelo: string; digest: string; ollama: string }> {
  const nome = modelo.includes(':') ? modelo : `${modelo}:latest`
  const tags = await pedir(buscar, '/api/tags', undefined, 10_000) as { models?: { name?: string; model?: string; digest?: string }[] }
  const achado = tags.models?.find((m) => m.name === nome || m.model === nome)
  if (!achado?.digest || !/^[0-9a-f]{64}$/.test(achado.digest)) throw new Error(`o modelo ${nome} não está instalado no Ollama (ollama pull ${nome})`)
  const versao = await pedir(buscar, '/api/version', undefined, 10_000) as { version?: string }
  return { modelo: nome, digest: achado.digest, ollama: versao.version ?? 'desconhecida' }
}
