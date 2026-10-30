/**
 * A comparação "modelo sozinho": a mesma pergunta que o Cosmos responde (a conclusão segue, contradiz ou é independente
 * das premissas?), feita direto ao modelo, com as mesmas definições de classe do pedido e sem o Z3. Serve para mostrar
 * o que o Z3 acrescenta: no Cosmos, o modelo só traduz e quem decide a classe é o Z3. Só roda quando chamado:
 *   SOZINHO_CONJUNTO=<.jsonl com {item}>  SOZINHO_SAIDA=<.jsonl>  [SOZINHO_MODELO=openai/gpt-oss-120b]
 * Pelo Groq (a chave fica no ambiente e nunca é impressa). Respeita os 8 mil tokens por minuto do plano grátis.
 */
import { it } from 'vitest'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { criarAdaptadorGroq } from '../src/integracoes/provedores/groq'
import type { ModeloGroq } from '../src/integracoes/groq-contratos'
import { CLASSES, type Item } from '../src/motor/avaliacao'
import { DEFINICAO_CLASSES, objetoDaResposta } from '../src/motor/formalizacao'

const CONJUNTO = process.env.SOZINHO_CONJUNTO, SAIDA = process.env.SOZINHO_SAIDA
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const SISTEMA_SOZINHO = `Você recebe um argumento em português: premissas e uma conclusão. Leia as frases exatamente como estão, sem acrescentar conhecimento do mundo.

${DEFINICAO_CLASSES}

Responda SÓ com um objeto JSON, sem texto antes ou depois: {"classe": "segue" | "contradiz" | "independente"}`

it.runIf(!!CONJUNTO && !!SAIDA)('o modelo sozinho diz a classe de cada argumento', async () => {
  const itens = readFileSync(CONJUNTO!, 'utf8').split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { item: Item }).item)
  // retoma de onde parou: o que já está na saída não é perguntado de novo
  const feitos = new Set(existsSync(SAIDA!) ? readFileSync(SAIDA!, 'utf8').split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { id: string }).id) : [])
  const modelo = (process.env.SOZINHO_MODELO ?? 'openai/gpt-oss-120b') as ModeloGroq
  const groq = criarAdaptadorGroq({ chave: () => process.env.GROQ_API_KEY, prazoMs: 20_000 })
  for (const item of itens.filter((i) => !feitos.has(i.id))) {
    const messages = [{ role: 'system' as const, content: SISTEMA_SOZINHO },
      { role: 'user' as const, content: `Premissas:\n${item.texto.premissas.map((p) => `- ${p}`).join('\n')}\n\nConclusão: ${item.texto.conclusao}` }]
    let linha: Record<string, unknown> = { id: item.id, classe_gabarito: item.gabarito.classe, classe_dita: null }
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      try {
        const r = await groq({ model: modelo, messages, max_tokens: 4096, temperature: 0 })
        const o = objetoDaResposta(r.conteudo) as { classe?: unknown }
        linha = { ...linha, classe_dita: CLASSES.includes(o?.classe as never) ? o.classe : null, tokens: r.usage.total_tokens }
        await esperar(Math.ceil((r.usage.total_tokens / 8000) * 60_000) + 500)
        break
      } catch (e) {
        linha = { ...linha, motivo: (e as Error).message }
        await esperar(61_000)
      }
    }
    appendFileSync(SAIDA!, JSON.stringify(linha) + '\n')
  }
}, 24 * 3600_000)
