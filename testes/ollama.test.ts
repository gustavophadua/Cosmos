/**
 * O adaptador do Ollama local (src/integracoes/provedores/ollama.ts), com um fetch de mentira: o pedido vai só para
 * 127.0.0.1, com o "modo pensando" desligado, o esquema JSON e as opções fixas da medição; o digest identifica o modelo.
 */
import { describe, it, expect } from 'vitest'
import { criarAdaptadorOllama, descreverModeloOllama } from '../src/integracoes/provedores/ollama'
import { ESQUEMA_RESPOSTA } from '../src/motor/formalizacao'

const DIGEST = 'a'.repeat(64)
function falso(respostas: Record<string, unknown>) {
  const pedidos: { url: string; corpo: unknown }[] = []
  const buscar = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, corpo: init?.body ? JSON.parse(init.body as string) : undefined })
    const caminho = new URL(url).pathname
    return new Response(JSON.stringify(respostas[caminho]), { status: caminho in respostas ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return { buscar, pedidos }
}

describe('Ollama local', () => {
  it('pede pela API nativa em 127.0.0.1, sem pensar, com o esquema e as opções fixas', async () => {
    const f = falso({ '/api/chat': { message: { content: '{"premissas":[]}' }, prompt_eval_count: 900, eval_count: 120 } })
    const perguntar = criarAdaptadorOllama({ modelo: 'qwen3:4b', formato: ESQUEMA_RESPOSTA, buscar: f.buscar })
    expect(await perguntar([{ role: 'user', content: 'oi' }])).toEqual({ conteudo: '{"premissas":[]}', prompt: 900, completion: 120 })
    expect(f.pedidos[0].url).toBe('http://127.0.0.1:11434/api/chat')
    expect(f.pedidos[0].corpo).toEqual({ model: 'qwen3:4b', messages: [{ role: 'user', content: 'oi' }], stream: false, think: false, format: ESQUEMA_RESPOSTA, options: { temperature: 0, seed: 0, num_ctx: 4096 } })
  })

  it('o digest e a versão identificam o modelo; modelo não instalado é recusado', async () => {
    const f = falso({ '/api/tags': { models: [{ name: 'qwen3:4b', model: 'qwen3:4b', digest: DIGEST }] }, '/api/version': { version: '0.12.0' } })
    expect(await descreverModeloOllama('qwen3:4b', f.buscar)).toEqual({ modelo: 'qwen3:4b', digest: DIGEST, ollama: '0.12.0' })
    await expect(descreverModeloOllama('qwen3:8b', f.buscar)).rejects.toThrow(/não está instalado/)
  })

  it('erro do Ollama não vira resposta', async () => {
    const perguntar = criarAdaptadorOllama({ modelo: 'qwen3:4b', buscar: falso({}).buscar })
    await expect(perguntar([{ role: 'user', content: 'oi' }])).rejects.toThrow(/404/)
  })
})
