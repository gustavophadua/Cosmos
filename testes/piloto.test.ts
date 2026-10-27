/**
 * O piloto sem treino (especificacao/formalizacao-v1.md): um modelo pronto propõe a formalização de cada item e as
 * respostas vão para um arquivo, que a nota de testes/avaliacao.test.ts confere depois pelo Z3. Só roda quando chamado:
 *   PILOTO_PROVEDOR=groq|ollama  PILOTO_SAIDA=<pasta>  [PILOTO_MODELO=...]  [PILOTO_CONJUNTO=<arquivo .jsonl>]
 * Sem PILOTO_CONJUNTO, usa os exemplos públicos. O conjunto fechado só vai para um modelo local (Ollama em 127.0.0.1):
 * com o Groq ele é recusado, porque mandar os itens para fora estragaria o conjunto. A chave do Groq vem do ambiente
 * (GROQ_API_KEY) e não é impressa nem gravada.
 */
import { it, expect } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { criarAdaptadorGroq } from '../src/integracoes/provedores/groq'
import type { ModeloGroq } from '../src/integracoes/groq-contratos'
import type { Item } from '../src/motor/avaliacao'
import { lerProposta, mensagensDeFormalizacao, PROMPT_FORMALIZACAO, type Mensagem } from '../src/motor/formalizacao'

const PROVEDOR = process.env.PILOTO_PROVEDOR, SAIDA = process.env.PILOTO_SAIDA
const PUBLICOS = 'avaliacao/exemplos-publicos-v1.jsonl'
const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

it.runIf(!!PROVEDOR && !!SAIDA)('piloto: o modelo propõe a formalização de cada item', async () => {
  const arquivo = process.env.PILOTO_CONJUNTO ?? PUBLICOS
  const fechado = resolve(arquivo) !== resolve(PUBLICOS)
  if (fechado && PROVEDOR !== 'ollama') throw new Error('o conjunto fechado só vai para um modelo local (PILOTO_PROVEDOR=ollama)')
  const linhas = lerJsonl<Item | { item: Item }>(arquivo).map((l) => ('item' in l ? l.item : l))
  const exemplos = lerJsonl<Item>(PUBLICOS)
  const modelo = process.env.PILOTO_MODELO ?? (PROVEDOR === 'groq' ? 'openai/gpt-oss-120b' : 'qwen3:8b')

  let perguntar: (m: Mensagem[]) => Promise<{ conteudo: string; prompt: number; completion: number }>
  if (PROVEDOR === 'groq') {
    const groq = criarAdaptadorGroq({ chave: () => process.env.GROQ_API_KEY, prazoMs: 20_000 })
    perguntar = async (messages) => {
      const r = await groq({ model: modelo as ModeloGroq, messages, max_tokens: 4096, temperature: 0 })
      return { conteudo: r.conteudo, prompt: r.usage.prompt_tokens, completion: r.usage.completion_tokens }
    }
  } else if (PROVEDOR === 'ollama') {
    const url = 'http://127.0.0.1:11434/v1/chat/completions' // só local: o conjunto fechado não sai do aparelho
    perguntar = async (messages) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelo, messages, temperature: 0, stream: false }) })
      if (!r.ok) throw new Error(`Ollama respondeu ${r.status}`)
      const b = await r.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } }
      return { conteudo: b.choices[0].message.content, prompt: b.usage?.prompt_tokens ?? 0, completion: b.usage?.completion_tokens ?? 0 }
    }
  } else throw new Error('PILOTO_PROVEDOR é groq ou ollama')

  mkdirSync(SAIDA!, { recursive: true })
  const respostas: string[] = [], medicoes: string[] = []
  for (const item of linhas) {
    // os exemplos do pedido nunca são o próprio item
    const mensagens = mensagensDeFormalizacao(item.texto, item.vocabulario, exemplos.filter((e) => e.id !== item.id))
    const inicio = Date.now()
    let medicao: Record<string, unknown> = { id: item.id }
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const r = await perguntar(mensagens)
        medicao = { id: item.id, ms: Date.now() - inicio, prompt_tokens: r.prompt, completion_tokens: r.completion }
        try {
          const p = lerProposta(r.conteudo, item.vocabulario)
          respostas.push(JSON.stringify({ id: item.id, premissas: p.premissas, conclusao: p.conclusao, classe: p.classe }))
          medicao.lida = true
        } catch (e) { medicao = { ...medicao, lida: false, motivo: (e as Error).message } }
        break
      } catch (e) {
        // limite por minuto do Groq: espera e tenta de novo; outro erro fica registrado
        medicao = { id: item.id, ms: Date.now() - inicio, lida: false, motivo: `provedor: ${(e as Error).message}` }
        if (PROVEDOR === 'groq') await esperar(61_000)
      }
    }
    medicoes.push(JSON.stringify(medicao))
    console.log(JSON.stringify(medicao))
    if (PROVEDOR === 'groq') await esperar(20_000) // 8 mil tokens por minuto no plano grátis
  }
  writeFileSync(join(SAIDA!, 'respostas.jsonl'), respostas.join('\n') + '\n')
  writeFileSync(join(SAIDA!, 'medicoes.jsonl'), medicoes.join('\n') + '\n')
  writeFileSync(join(SAIDA!, 'meta.json'), JSON.stringify({ provedor: PROVEDOR, modelo, prompt: PROMPT_FORMALIZACAO, conjunto: fechado ? 'fechado' : PUBLICOS, itens: linhas.length, lidas: respostas.length, data: new Date().toISOString() }, null, 2) + '\n')
  expect(medicoes).toHaveLength(linhas.length)
}, 3_600_000)
