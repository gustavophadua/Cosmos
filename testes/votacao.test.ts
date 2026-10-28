/**
 * A votação (passo D3 do plano de fechamento): das n respostas que o piloto guardou por item (candidatos.jsonl, com
 * PILOTO_VOTOS), fica a da maior turma de fórmulas equivalentes pelo Z3 (premissas juntas e conclusão), não a de texto
 * igual: duas formas de escrever a mesma coisa votam juntas. Empate: a turma do candidato que veio primeiro. A classe
 * é a mais dita dentro da turma. Só roda quando chamado, uma fatia por processo:
 *   VOTACAO_CONJUNTO=<.jsonl>  VOTACAO_CANDIDATOS=<candidatos.jsonl>  VOTACAO_SAIDA=<respostas.jsonl>  [VOTACAO_FATIA=início-fim]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { appendFileSync, readFileSync } from 'node:fs'
import type { Item, Termo } from '../src/motor/avaliacao'
import { votar, type Candidato } from '../src/motor/avaliacaoZ3'

const CONJUNTO = process.env.VOTACAO_CONJUNTO, CANDIDATOS = process.env.VOTACAO_CANDIDATOS, SAIDA = process.env.VOTACAO_SAIDA
const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any, killThreads: (em: unknown) => Promise<void>
const ativo = !!CONJUNTO && !!CANDIDATOS && !!SAIDA
beforeAll(async () => { const z3 = await import('z3-solver'); killThreads = z3.killThreads; api = await z3.init() }, 120_000)
afterAll(async () => { if (api) await killThreads(api.em) })

describe('Votação pelo Z3', () => {
  it('turmas por equivalência, não por texto: duas formas da mesma fórmula votam juntas', async () => {
    const v: Termo[] = [{ simbolo: 'P', tipo: 'predicado', aridade: 1, leitura: 'x é p' }, { simbolo: 'Q', tipo: 'predicado', aridade: 1, leitura: 'x é q' }, { simbolo: 'a', tipo: 'constante', aridade: 0, leitura: 'A' }]
    const certo = { premissas: ['∀x (P(x) ⟹ Q(x))', 'P(a)'], conclusao: 'Q(a)', classe: 'segue' as const }
    const outraForma = { premissas: ['P(a)', '∀x (¬Q(x) ⟹ ¬P(x))'], conclusao: '¬¬Q(a)', classe: 'segue' as const }
    const errado = { premissas: ['∀x (Q(x) ⟹ P(x))', 'P(a)'], conclusao: 'Q(a)', classe: 'independente' as const }
    // o errado vem primeiro e repete o texto, mas a turma equivalente é maior
    expect(await votar(api, v, [errado, certo, outraForma, errado, { ...certo, classe: 'independente' }])).toEqual(certo)
    expect(await votar(api, v, [])).toBeNull()
  }, 120_000)

  it.runIf(ativo)('vota as respostas de um lote', async () => {
    const itens = new Map(lerJsonl<Item | { item: Item }>(CONJUNTO!).map((l) => ('item' in l ? l.item : l)).map((i) => [i.id, i]))
    const linhas = lerJsonl<{ id: string; candidatos: Candidato[] }>(CANDIDATOS!)
    const [de, ate] = (process.env.VOTACAO_FATIA ?? `0-${linhas.length}`).split('-').map(Number)
    for (const l of linhas.slice(de, ate)) {
      const r = await votar(api, itens.get(l.id)!.vocabulario, l.candidatos)
      if (r) appendFileSync(SAIDA!, JSON.stringify({ id: l.id, ...r }) + '\n')
    }
  }, 1_800_000)
})
