/**
 * As 20 frases da realidade (avaliacao/realidade-frases-v1.jsonl) numa IA comum, sem base de fatos e sem Z3: o modelo
 * sozinho diz, com o que sabe, se cada frase é fato, contraria os fatos, relato ou visão, e o que a conclusão é diante do
 * relato. A saída tem a forma do resultado do Cosmos, para o mesmo pontuador (scripts/pontuar-realidade.py).
 * Só roda quando chamado:
 *   SOZINHO=ollama  (qwen3:4b local, o mesmo que traduz para o Cosmos)
 *   SOZINHO=groq    (openai/gpt-oss-120b; a chave vem de GROQ_API_KEY, nunca é escrita)
 * A saída vai para tmp/realidade-sozinho/<provedor>/resultado.jsonl (fora do Git).
 */
import { it } from 'vitest'
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { criarAdaptadorOllama, descarregarModeloOllama } from '../src/integracoes/provedores/ollama'
import { criarAdaptadorGroq } from '../src/integracoes/provedores/groq'
import { objetoDaResposta } from '../src/motor/formalizacao'
import { separarArgumento } from '../src/interfaces/assistente'

const PROVEDOR = process.env.SOZINHO
const PASTA = `tmp/realidade-sozinho/${PROVEDOR}`

// as definições são as da regra do conjunto (realidade-frases-v1.leia.json), em palavras de quem não conhece o Cosmos
export const SISTEMA_SOZINHO = `Você analisa frases sobre o mundo físico. Não se molde a quem pergunta e não chute: diga só o que a física e a ciência estabelecidas decidem.

Para CADA frase, julgada sozinha (sem as outras frases), escolha uma situação:
- "fato": a ciência estabelecida garante que a frase é verdadeira;
- "contraria": a ciência estabelecida garante que a frase é falsa;
- "relato": fala de coisas físicas, mas a ciência sozinha não decide (depende do caso: é um relato de quem fala);
- "visao": não é uma questão física (opinião, sentimento, interpretação, algo vago demais para a física decidir).

Depois, a CONCLUSÃO (a última frase) diante do relato: suponha verdadeiras as outras frases que não contrariam a ciência, junto com tudo o que a ciência estabelece. Então a conclusão:
- "segue": tem de ser verdadeira;
- "contradiz": tem de ser falsa;
- "independente": pode ser verdadeira ou falsa.

Responda SÓ com JSON: {"frases": ["<situação da frase 1>", ...], "conclusao": "<segue|contradiz|independente>"}`

const ESQUEMA = {
  type: 'object', required: ['frases', 'conclusao'],
  properties: { frases: { type: 'array', items: { type: 'string', enum: ['fato', 'contraria', 'relato', 'visao'] } }, conclusao: { type: 'string', enum: ['segue', 'contradiz', 'independente'] } },
}
const SITUACAO: Record<string, string> = { fato: 'fato', contraria: 'contraria', relato: 'observacao', visao: 'fora' }

it.runIf(PROVEDOR === 'ollama' || PROVEDOR === 'groq')('as 20 frases numa IA comum, sozinha', async () => {
  rmSync(PASTA, { recursive: true, force: true }); mkdirSync(PASTA, { recursive: true })
  const itens = readFileSync('avaliacao/realidade-frases-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; frase: string })
  const ollama = criarAdaptadorOllama({ modelo: 'qwen3:4b', temperatura: 0, semente: 0, contexto: 4096, formato: ESQUEMA })
  const groq = criarAdaptadorGroq({ chave: () => process.env.GROQ_API_KEY, prazoMs: 20_000 })
  for (const item of itens) {
    const t = separarArgumento(item.frase)
    const frases = t ? [...t.premissas, t.conclusao] : [item.frase]
    const pedido = `Frases:\n${frases.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    let bruto = '', erro: string | null = null
    try {
      bruto = PROVEDOR === 'ollama'
        ? (await ollama([{ role: 'system', content: SISTEMA_SOZINHO }, { role: 'user', content: pedido }])).conteudo
        : (await groq({ model: 'openai/gpt-oss-120b', messages: [{ role: 'system', content: SISTEMA_SOZINHO }, { role: 'user', content: pedido }], max_tokens: 4096, temperature: 0 })).conteudo
    } catch (e) { erro = (e as Error).message }
    let realidade: unknown = null
    try {
      const o = objetoDaResposta(bruto) as { frases?: unknown; conclusao?: unknown }
      if (Array.isArray(o.frases) && o.frases.length === frases.length && o.frases.every((s) => typeof s === 'string' && s in SITUACAO) && ['segue', 'contradiz', 'independente'].includes(o.conclusao as string))
        realidade = { frases: (o.frases as string[]).map((s) => ({ situacao: SITUACAO[s] })), conclusaoComRelato: o.conclusao }
      else erro ??= 'resposta fora do formato'
    } catch { erro ??= 'resposta não é JSON' }
    appendFileSync(`${PASTA}/resultado.jsonl`, JSON.stringify({ id: item.id, frase: item.frase, frases, realidade, erro, bruto }) + '\n')
    // a Groq gratuita aceita 8.000 tokens por minuto: uma frase a cada 10 s fica abaixo
    if (PROVEDOR === 'groq') await new Promise((r) => setTimeout(r, 10_000))
  }
  if (PROVEDOR === 'ollama') await descarregarModeloOllama('qwen3:4b').catch(() => undefined)
}, 3_600_000)
