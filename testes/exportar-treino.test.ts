/**
 * Exporta um lote de frases (scripts/gerar-frases.py) como conversas de treino, no formato da tradução cega que o
 * serviço usa (formalizarCego, versão CEGO_FORMALIZACAO): cada item vira DUAS conversas, a das premissas (sem a
 * conclusão) e a da conclusão (só a frase e o vocabulário em uso), com os mesmos pedidos e exemplos públicos do serviço
 * e a resposta certa. O modelo treinado vê no treino exatamente o que verá na Conversa. Só roda quando chamado:
 *   TREINO_ARQUIVO=<.jsonl>  TREINO_SAIDA=<arquivo .jsonl>  [TREINO_RECUSADOS=<recusados.jsonl de frases-geradas>]
 * Um em cada cinco itens vai com o vocabulário dado (o caminho de "corrigir os termos" na Conversa). Os itens recusados
 * pelo Z3 ficam de fora. Nunca recebe o conjunto fechado nem as frases G-: só lotes do gerador público (V-, T-, W-).
 */
import { it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Item, Termo } from '../src/motor/avaliacao'
import { CEGO_FORMALIZACAO, mensagensDaConclusao, mensagensDasPremissas } from '../src/motor/formalizacao'

const ARQUIVO = process.env.TREINO_ARQUIVO, SAIDA = process.env.TREINO_SAIDA
const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
const usados = (formulas: string[], v: Termo[]) => {
  const nomes = new Set(formulas.flatMap((f) => f.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []))
  return v.filter((t) => nomes.has(t.simbolo))
}
/** um em cada cinco, pelo id (o mesmo item cai sempre do mesmo lado) */
const comVocabularioDado = (id: string) => createHash('sha256').update(id).digest()[0] % 5 === 0

/** As duas conversas da tradução cega de um item, com as respostas certas. */
export function conversasCegas(item: Item, exemplos: Item[]) {
  const dado = comVocabularioDado(item.id), v = item.vocabulario
  const dasPremissas = dado ? v : usados(item.gabarito.premissas, v)
  const emUso = dado ? v : dasPremissas
  const resposta = dado ? v : [...emUso, ...usados([item.gabarito.conclusao], v).filter((t) => !emUso.includes(t))]
  return [
    { passo: 'premissas', messages: [...mensagensDasPremissas(item.texto.premissas, dado ? v : null, exemplos),
      { role: 'assistant', content: JSON.stringify({ vocabulario: dasPremissas, premissas: item.gabarito.premissas }) }] },
    { passo: 'conclusao', messages: [...mensagensDaConclusao(item.texto.conclusao, emUso, dado, exemplos),
      { role: 'assistant', content: JSON.stringify({ vocabulario: resposta, conclusao: item.gabarito.conclusao }) }] },
  ]
}

it.runIf(!!ARQUIVO && !!SAIDA)('exporta o lote como conversas de treino (tradução cega)', () => {
  const linhas = lerJsonl<{ padrao: string; item: Item }>(ARQUIVO!)
  // o gerador público numera V-, T- e W-; o conjunto fechado (F-), a revisão (R-) e as frases G- não entram em treino
  if (linhas.some((l) => !/^[VTW]-\d+$/.test(l.item.id))) throw new Error('só lotes do gerador público (ids V-, T- ou W-)')
  const recusados = new Set(process.env.TREINO_RECUSADOS && existsSync(process.env.TREINO_RECUSADOS) ? lerJsonl<{ id: string }>(process.env.TREINO_RECUSADOS).map((r) => r.id) : [])
  const exemplos = lerJsonl<Item>('avaliacao/exemplos-publicos-v1.jsonl')
  const aceitos = linhas.filter((l) => !recusados.has(l.item.id))
  const saida = aceitos.flatMap(({ padrao, item }) => conversasCegas(item, exemplos).map((c) => JSON.stringify({ id: `${item.id}/${c.passo}`, padrao, prompt: CEGO_FORMALIZACAO, ...c })))
  const corpo = saida.join('\n') + '\n'
  writeFileSync(SAIDA!, corpo)
  console.log(`${aceitos.length} itens, ${saida.length} conversas (${recusados.size} recusados) em ${SAIDA}, sha256 ${createHash('sha256').update(corpo).digest('hex')}`)
  expect(saida.length).toBe(2 * aceitos.length)
})
