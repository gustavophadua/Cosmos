/**
 * Exporta um lote de frases (scripts/gerar-frases.py) como conversas de treino, com o MESMO pedido do piloto
 * (mensagensDeFormalizacao, versão PROMPT_FORMALIZACAO, dois exemplos públicos) e a resposta certa no formato do
 * esquema: o modelo treinado vê no treino exatamente o que verá na nota. Só roda quando chamado:
 *   TREINO_ARQUIVO=<.jsonl>  TREINO_SAIDA=<arquivo .jsonl>  [TREINO_RECUSADOS=<recusados.jsonl de frases-geradas>]
 * Os itens recusados pelo Z3 ficam de fora. Nunca recebe o conjunto fechado: só lotes do gerador público.
 */
import { it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Item } from '../src/motor/avaliacao'
import { mensagensDeFormalizacao, PROMPT_FORMALIZACAO, respostaDoExemplo } from '../src/motor/formalizacao'

const ARQUIVO = process.env.TREINO_ARQUIVO, SAIDA = process.env.TREINO_SAIDA
const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)

it.runIf(!!ARQUIVO && !!SAIDA)('exporta o lote como conversas de treino', () => {
  const linhas = lerJsonl<{ padrao: string; item: Item }>(ARQUIVO!)
  // o gerador público numera V-… e T-…; o conjunto fechado (F-…) não entra em treino
  if (linhas.some((l) => !/^[VT]-\d+$/.test(l.item.id))) throw new Error('só lotes do gerador público (ids V-… ou T-…)')
  const recusados = new Set(process.env.TREINO_RECUSADOS && existsSync(process.env.TREINO_RECUSADOS) ? lerJsonl<{ id: string }>(process.env.TREINO_RECUSADOS).map((r) => r.id) : [])
  const exemplos = lerJsonl<Item>('avaliacao/exemplos-publicos-v1.jsonl')
  const saida = linhas.filter((l) => !recusados.has(l.item.id)).map(({ padrao, item }) => JSON.stringify({
    id: item.id, padrao, prompt: PROMPT_FORMALIZACAO,
    messages: [...mensagensDeFormalizacao(item.texto, item.vocabulario, exemplos), { role: 'assistant', content: respostaDoExemplo(item) }],
  }))
  const corpo = saida.join('\n') + '\n'
  writeFileSync(SAIDA!, corpo)
  console.log(`${saida.length} conversas (${recusados.size} recusadas) em ${SAIDA}, sha256 ${createHash('sha256').update(corpo).digest('hex')}`)
  expect(saida.length).toBe(linhas.length - [...recusados].filter((id) => linhas.some((l) => l.item.id === id)).length)
})
